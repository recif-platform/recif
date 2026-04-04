"""Connector-based document sources — pull from external services.

Each connector implements the Source interface to extract documents from
external platforms: Google Drive, Jira, Confluence, Databricks, etc.

Connectors are authenticated via credentials passed at construction time.
The KB configuration stores the connector type and auth reference.
"""

from __future__ import annotations

import logging
from abc import abstractmethod

from maree.models import Document
from maree.sources.base import Source

logger = logging.getLogger(__name__)


class ConnectorSource(Source):
    """Base class for external service connectors.

    Subclasses implement `_fetch_documents()` to pull content from
    their respective platforms. The `extract()` method handles common
    concerns like pagination, rate limiting, and error handling.
    """

    def __init__(self, credentials: dict | None = None, **kwargs: object) -> None:
        self._credentials = credentials or {}
        self._config = kwargs

    async def extract(self, path: str) -> list[Document]:
        """Extract documents from the external service.

        `path` semantics vary by connector:
        - Google Drive: folder ID or URL
        - Jira: project key or JQL query
        - Confluence: space key or page ID
        - Databricks: catalog.schema.table or notebook path
        """
        try:
            return await self._fetch_documents(path)
        except Exception:
            logger.exception("Connector extraction failed: %s path=%s", self.__class__.__name__, path)
            return []

    @abstractmethod
    async def _fetch_documents(self, path: str) -> list[Document]:
        """Fetch documents from the external service. Implemented by each connector."""
        ...

    @property
    @abstractmethod
    def connector_type(self) -> str:
        """Return the connector type identifier (e.g., 'google_drive', 'jira')."""
        ...


class GoogleDriveSource(ConnectorSource):
    """Extract documents from Google Drive folders.

    Requires: google-api-python-client, google-auth
    Credentials: service account JSON or OAuth token.
    Path: Google Drive folder ID.
    """

    @property
    def connector_type(self) -> str:
        return "google_drive"

    async def _fetch_documents(self, path: str) -> list[Document]:
        try:
            from googleapiclient.discovery import build
            from google.oauth2.service_account import Credentials
        except ImportError:
            logger.error("google-api-python-client not installed. Install with: pip install google-api-python-client google-auth")
            return []

        creds = Credentials.from_service_account_info(self._credentials)
        service = build("drive", "v3", credentials=creds)

        # List files in folder
        query = f"'{path}' in parents and trashed = false"
        results = service.files().list(q=query, fields="files(id, name, mimeType)").execute()
        files = results.get("files", [])

        documents: list[Document] = []
        for f in files:
            mime = f.get("mimeType", "")
            if mime == "application/vnd.google-apps.document":
                content = service.files().export(fileId=f["id"], mimeType="text/plain").execute()
                text = content.decode("utf-8") if isinstance(content, bytes) else str(content)
            elif mime in ("text/plain", "text/markdown", "text/csv"):
                content = service.files().get_media(fileId=f["id"]).execute()
                text = content.decode("utf-8") if isinstance(content, bytes) else str(content)
            else:
                continue

            documents.append(Document(
                id=f["id"],
                content=text,
                metadata={"filename": f["name"], "source": "google_drive", "mime_type": mime},
            ))

        logger.info("Google Drive: extracted %d documents from folder %s", len(documents), path)
        return documents


class JiraSource(ConnectorSource):
    """Extract issues from Jira projects.

    Credentials: {"url": "https://your-domain.atlassian.net", "email": "...", "api_token": "..."}
    Path: JQL query or project key (e.g., "PROJ" or "project = PROJ AND status = Done")
    """

    @property
    def connector_type(self) -> str:
        return "jira"

    async def _fetch_documents(self, path: str) -> list[Document]:
        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed")
            return []

        base_url = self._credentials.get("url", "")
        email = self._credentials.get("email", "")
        api_token = self._credentials.get("api_token", "")

        # If path looks like a simple project key, wrap in JQL
        jql = path if " " in path else f"project = {path} ORDER BY updated DESC"

        documents: list[Document] = []
        start_at = 0
        max_results = 50

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                resp = await client.get(
                    f"{base_url}/rest/api/3/search",
                    params={"jql": jql, "startAt": start_at, "maxResults": max_results},
                    auth=(email, api_token),
                )
                resp.raise_for_status()
                data = resp.json()

                for issue in data.get("issues", []):
                    fields = issue.get("fields", {})
                    summary = fields.get("summary", "")
                    description = ""
                    desc_content = fields.get("description")
                    if isinstance(desc_content, dict):
                        # Atlassian Document Format — extract text nodes
                        description = _extract_adf_text(desc_content)
                    elif isinstance(desc_content, str):
                        description = desc_content

                    content = f"# {issue['key']}: {summary}\n\n{description}"
                    documents.append(Document(
                        id=issue["key"],
                        content=content,
                        metadata={
                            "source": "jira",
                            "key": issue["key"],
                            "status": fields.get("status", {}).get("name", ""),
                            "type": fields.get("issuetype", {}).get("name", ""),
                        },
                    ))

                total = data.get("total", 0)
                start_at += max_results
                if start_at >= total:
                    break

        logger.info("Jira: extracted %d issues for query: %s", len(documents), jql)
        return documents


class ConfluenceSource(ConnectorSource):
    """Extract pages from Confluence spaces.

    Credentials: {"url": "https://your-domain.atlassian.net/wiki", "email": "...", "api_token": "..."}
    Path: space key (e.g., "ENG")
    """

    @property
    def connector_type(self) -> str:
        return "confluence"

    async def _fetch_documents(self, path: str) -> list[Document]:
        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed")
            return []

        base_url = self._credentials.get("url", "")
        email = self._credentials.get("email", "")
        api_token = self._credentials.get("api_token", "")

        documents: list[Document] = []
        start = 0
        limit = 25

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                resp = await client.get(
                    f"{base_url}/rest/api/content",
                    params={
                        "spaceKey": path,
                        "expand": "body.storage",
                        "start": start,
                        "limit": limit,
                    },
                    auth=(email, api_token),
                )
                resp.raise_for_status()
                data = resp.json()

                for page in data.get("results", []):
                    title = page.get("title", "")
                    html_body = page.get("body", {}).get("storage", {}).get("value", "")
                    # Simple HTML → text (strip tags)
                    import re
                    text = re.sub(r"<[^>]+>", " ", html_body)
                    text = re.sub(r"\s+", " ", text).strip()

                    content = f"# {title}\n\n{text}"
                    documents.append(Document(
                        id=page["id"],
                        content=content,
                        metadata={
                            "source": "confluence",
                            "title": title,
                            "space": path,
                            "type": page.get("type", "page"),
                        },
                    ))

                size = data.get("size", 0)
                start += limit
                if size < limit:
                    break

        logger.info("Confluence: extracted %d pages from space %s", len(documents), path)
        return documents


class DatabricksSource(ConnectorSource):
    """Extract data from Databricks tables or notebooks.

    Credentials: {"host": "https://adb-xxx.azuredatabricks.net", "token": "dapi..."}
    Path: "catalog.schema.table" or "/Workspace/path/to/notebook"
    """

    @property
    def connector_type(self) -> str:
        return "databricks"

    async def _fetch_documents(self, path: str) -> list[Document]:
        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed")
            return []

        host = self._credentials.get("host", "")
        token = self._credentials.get("token", "")
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(base_url=host, headers=headers, timeout=60.0) as client:
            if path.startswith("/"):
                # Notebook export
                return await self._export_notebook(client, path)
            else:
                # Table preview
                return await self._preview_table(client, path)

    async def _export_notebook(self, client, path: str) -> list[Document]:
        resp = await client.get(
            "/api/2.0/workspace/export",
            params={"path": path, "format": "SOURCE"},
        )
        resp.raise_for_status()
        import base64
        content = base64.b64decode(resp.json().get("content", "")).decode("utf-8", errors="replace")
        return [Document(
            id=path,
            content=content,
            metadata={"source": "databricks", "type": "notebook", "path": path},
        )]

    async def _preview_table(self, client, table_path: str) -> list[Document]:
        # Use SQL Statements API to preview first 1000 rows
        resp = await client.post(
            "/api/2.0/sql/statements",
            json={
                "statement": f"SELECT * FROM {table_path} LIMIT 1000",
                "wait_timeout": "30s",
                "disposition": "INLINE",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        columns = [col["name"] for col in result.get("columns", [])]
        rows = result.get("data_array", [])

        # Format as markdown table
        header = "| " + " | ".join(columns) + " |"
        sep = "| " + " | ".join("---" for _ in columns) + " |"
        body_lines = ["| " + " | ".join(str(v) for v in row) + " |" for row in rows]
        content = f"# Table: {table_path}\n\n{header}\n{sep}\n" + "\n".join(body_lines)

        return [Document(
            id=table_path,
            content=content,
            metadata={"source": "databricks", "type": "table", "path": table_path, "row_count": len(rows)},
        )]


# ------------------------------------------------------------------ #
#  Helpers                                                             #
# ------------------------------------------------------------------ #

def _extract_adf_text(node: dict) -> str:
    """Recursively extract text from Atlassian Document Format."""
    if node.get("type") == "text":
        return node.get("text", "")
    parts: list[str] = []
    for child in node.get("content", []):
        parts.append(_extract_adf_text(child))
    return " ".join(parts)

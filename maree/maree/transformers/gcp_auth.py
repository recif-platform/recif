"""Shared GCP token provider for Vertex AI — used by both Corail and Marée."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TOKEN_REFRESH_MARGIN = 300


class GCPTokenProvider:
    """Fetches and caches GCP access tokens via service account or ADC."""

    def __init__(self) -> None:
        self._cached_token: str = ""
        self._token_expiry: float = 0.0
        self._token_lock = asyncio.Lock()
        self._credentials: dict[str, Any] | None = None
        self._project: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        self._client: httpx.AsyncClient | None = None

    @property
    def project(self) -> str:
        return self._project

    async def get_token(self) -> str:
        """Return a valid access token, refreshing if expired."""
        if self._cached_token and time.time() < self._token_expiry:
            return self._cached_token

        async with self._token_lock:
            if self._cached_token and time.time() < self._token_expiry:
                return self._cached_token

            token = await self._fetch_token()
            self._cached_token = token
            self._token_expiry = time.time() + 3600 - _TOKEN_REFRESH_MARGIN
            return token

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client

    async def _fetch_token(self) -> str:
        # 1. Load credentials file (cached after first read)
        if self._credentials is None:
            adc_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
            if adc_path and os.path.exists(adc_path):
                with open(adc_path) as f:
                    self._credentials = json.load(f)
                if not self._project and self._credentials.get("project_id"):
                    self._project = self._credentials["project_id"]

        if self._credentials:
            cred_type = self._credentials.get("type", "")
            if cred_type == "service_account":
                return await self._token_from_service_account(self._credentials)
            if cred_type == "authorized_user":
                token = await self._token_from_authorized_user(self._credentials)
                if token:
                    return token

            msg = f"Failed to obtain token from credentials (type={cred_type})"
            raise ValueError(msg)

        # 2. Metadata server (GCE/GKE/Cloud Run)
        client = await self._get_client()
        try:
            resp = await client.get(
                "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
                headers={"Metadata-Flavor": "Google"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                return resp.json()["access_token"]
        except (httpx.ConnectError, httpx.TimeoutException):
            pass

        # 3. Explicit token env var
        token = os.environ.get("GOOGLE_ACCESS_TOKEN", "")
        if token:
            return token

        msg = "No GCP credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_ACCESS_TOKEN."
        raise ValueError(msg)

    async def _token_from_service_account(self, creds: dict[str, Any]) -> str:
        try:
            import jwt
        except ImportError:
            msg = "PyJWT[crypto] required: pip install 'PyJWT[crypto]'"
            raise ImportError(msg) from None

        client_email = creds.get("client_email")
        private_key = creds.get("private_key")
        if not client_email or not private_key:
            msg = "Service account key missing 'client_email' or 'private_key'."
            raise ValueError(msg)

        now = int(time.time())
        payload = {
            "iss": client_email,
            "sub": client_email,
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
            "scope": "https://www.googleapis.com/auth/cloud-platform",
        }
        signed_jwt = jwt.encode(payload, private_key, algorithm="RS256")

        client = await self._get_client()
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": signed_jwt,
            },
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()["access_token"]

        msg = f"GCP token exchange failed ({resp.status_code}): {resp.text}"
        raise ValueError(msg)

    async def _token_from_authorized_user(self, creds: dict[str, Any]) -> str | None:
        refresh_token = creds.get("refresh_token")
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")
        if not (refresh_token and client_id and client_secret):
            return None

        client = await self._get_client()
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()["access_token"]

        logger.error("token exchange failed (authorized_user): %s %s", resp.status_code, resp.text)
        return None

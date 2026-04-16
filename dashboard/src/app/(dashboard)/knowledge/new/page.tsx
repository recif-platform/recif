"use client";
import { getAuthHeaders } from "@/lib/auth";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { inputStyle } from "@/lib/styles";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.1em", color: "#64748b", marginBottom: 6, display: "block",
};

const CONNECTOR_TYPES = [
  { value: "", label: "None (file upload only)" },
  { value: "google_drive", label: "Google Drive" },
  { value: "jira", label: "Jira" },
  { value: "confluence", label: "Confluence" },
  { value: "databricks", label: "Databricks" },
] as const;

const CONNECTOR_FIELDS: Record<string, { path: string; credentials: { key: string; label: string; type?: string }[] }> = {
  google_drive: {
    path: "Folder ID",
    credentials: [{ key: "service_account_json", label: "Service Account JSON", type: "textarea" }],
  },
  jira: {
    path: "Project Key or JQL",
    credentials: [
      { key: "url", label: "Jira URL (e.g. https://your-domain.atlassian.net)" },
      { key: "email", label: "Email" },
      { key: "api_token", label: "API Token", type: "password" },
    ],
  },
  confluence: {
    path: "Space Key",
    credentials: [
      { key: "url", label: "Confluence URL (e.g. https://your-domain.atlassian.net/wiki)" },
      { key: "email", label: "Email" },
      { key: "api_token", label: "API Token", type: "password" },
    ],
  },
  databricks: {
    path: "Table (catalog.schema.table) or Notebook Path (/Workspace/...)",
    credentials: [
      { key: "host", label: "Workspace URL" },
      { key: "token", label: "Access Token", type: "password" },
    ],
  },
};

export default function NewKnowledgeBasePage() {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-005");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Connector state
  const [connectorType, setConnectorType] = useState("");
  const [connectorPath, setConnectorPath] = useState("");
  const [connectorCreds, setConnectorCreds] = useState<Record<string, string>>({});
  const [connectorSchedule, setConnectorSchedule] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        embedding_model: embeddingModel,
      };
      if (connectorType) {
        body.connector = {
          type: connectorType,
          path: connectorPath,
          credentials: connectorCreds,
          schedule: connectorSchedule || undefined,
          status: "idle",
        };
      }
      const res = await fetch(`${API_URL}/api/v1/knowledge-bases`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      window.location.href = `/knowledge/${data.data?.id || ""}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Create Knowledge Base</h2>
        <Link href="/knowledge" style={{ color: colors.textMuted, fontSize: 14 }}>Back</Link>
      </div>

      <div className="reef-glass" style={{ padding: "24px", maxWidth: 600 }}>
        <div className="space-y-5">
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company Docs" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What documents does this KB contain?" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Embedding Model</label>
            <select value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} style={inputStyle}>
              <option value="text-embedding-005">text-embedding-005 (Vertex AI)</option>
              <option value="text-multilingual-embedding-002">text-multilingual-embedding-002 (Vertex AI)</option>
              <option value="text-embedding-3-small">text-embedding-3-small (OpenAI)</option>
              <option value="nomic-embed-text">nomic-embed-text (Ollama)</option>
              <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (Ollama)</option>
            </select>
          </div>
          {/* Connector */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
            <label style={labelStyle}>Data Source</label>
            <select
              value={connectorType}
              onChange={(e) => {
                setConnectorType(e.target.value);
                setConnectorPath("");
                setConnectorCreds({});
              }}
              style={inputStyle}
            >
              {CONNECTOR_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {connectorType && CONNECTOR_FIELDS[connectorType] && (
            <div
              className="space-y-4"
              style={{
                padding: "16px",
                borderRadius: 10,
                background: "rgba(34,211,238,0.03)",
                border: "1px solid rgba(34,211,238,0.1)",
              }}
            >
              <div>
                <label style={labelStyle}>{CONNECTOR_FIELDS[connectorType].path}</label>
                <input
                  value={connectorPath}
                  onChange={(e) => setConnectorPath(e.target.value)}
                  placeholder={CONNECTOR_FIELDS[connectorType].path}
                  style={inputStyle}
                />
              </div>

              {CONNECTOR_FIELDS[connectorType].credentials.map((field) => (
                <div key={field.key}>
                  <label style={labelStyle}>{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={connectorCreds[field.key] || ""}
                      onChange={(e) => setConnectorCreds({ ...connectorCreds, [field.key]: e.target.value })}
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={connectorCreds[field.key] || ""}
                      onChange={(e) => setConnectorCreds({ ...connectorCreds, [field.key]: e.target.value })}
                      placeholder={field.label}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}

              <div>
                <label style={labelStyle}>Sync Schedule (cron, optional)</label>
                <input
                  value={connectorSchedule}
                  onChange={(e) => setConnectorSchedule(e.target.value)}
                  placeholder="e.g. 0 */6 * * * (every 6 hours)"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {error && <p style={{ color: "#f87171", fontSize: 14 }}>{error}</p>}

          <button onClick={handleCreate} disabled={saving || !name.trim()} className="btn-reef-primary">
            {saving ? "Creating..." : "Create Knowledge Base"}
          </button>
        </div>
      </div>
    </div>
  );
}

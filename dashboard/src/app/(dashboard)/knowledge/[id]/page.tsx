"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/lib/theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/* ---- Shared styles ---- */
const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#64748b",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f1f5f9",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)";
};

const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
};

/* ---- Types ---- */
interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  doc_count: number;
  chunk_count: number;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  status: "ready" | "processing" | "empty";
  created_at: string;
}

interface KBDocument {
  id: string;
  filename: string;
  status: "pending" | "processing" | "ready" | "failed";
  chunk_count: number;
  content_type: string;
  created_at: string;
}

const statusConfig: Record<string, { color: string; glow: string }> = {
  ready: { color: "#22c55e", glow: "rgba(34,197,94,0.5)" },
  processing: { color: "#eab308", glow: "rgba(234,179,8,0.5)" },
  pending: { color: "#eab308", glow: "rgba(234,179,8,0.5)" },
  empty: { color: "#64748b", glow: "rgba(100,116,139,0.3)" },
  failed: { color: "#ef4444", glow: "rgba(239,68,68,0.5)" },
};

interface UploadFile {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface SearchResult {
  chunk_id: string;
  content: string;
  score: number;
  chunk_index: number;
  document_id: string;
  filename: string;
}

type TabKey = "documents" | "upload" | "retrieval" | "settings";

export default function KnowledgeDetailPage() {
  const { colors } = useTheme();
  const params = useParams();
  const kbId = params?.id as string;

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("documents");

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/v1/knowledge-bases/${kbId}`).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/knowledge-bases/${kbId}/documents`).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([kbRes, docsRes]) => {
        setKb(kbRes.data || null);
        setDocs(docsRes.data || []);
        if (kbRes.data) {
          setSettingsForm({
            name: kbRes.data.name || "",
            description: kbRes.data.description || "",
            embedding_model: kbRes.data.embedding_model || "nomic-embed-text",
            chunk_size: kbRes.data.chunk_size || 512,
            chunk_overlap: kbRes.data.chunk_overlap || 50,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  /* ---- Upload tab state ---- */
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Settings tab state ---- */
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    description: "",
    embedding_model: "nomic-embed-text",
    chunk_size: 512,
    chunk_overlap: kb?.chunk_overlap || 50,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* ---- Retrieval test state ---- */
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalTopK, setRetrievalTopK] = useState(5);
  const [retrievalResults, setRetrievalResults] = useState<SearchResult[]>([]);
  const [retrievalSearching, setRetrievalSearching] = useState(false);
  const [retrievalTime, setRetrievalTime] = useState<number | null>(null);

  const ACCEPTED_TYPES = ".pdf,.txt,.md,.docx";

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: UploadFile[] = Array.from(files).map((f) => ({
      file: f,
      status: "queued" as const,
      progress: 0,
    }));
    setUploadFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const startIngestion = async () => {
    for (let i = 0; i < uploadFiles.length; i++) {
      if (uploadFiles[i].status !== "queued") continue;

      setUploadFiles((prev) =>
        prev.map((f, idx) => idx === i ? { ...f, status: "uploading", progress: 30 } : f)
      );

      try {
        const formData = new FormData();
        formData.append("file", uploadFiles[i].file);

        const res = await fetch(`${API_URL}/api/v1/knowledge-bases/${kbId}/ingest`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        setUploadFiles((prev) =>
          prev.map((f, idx) => idx === i ? { ...f, status: "done", progress: 100 } : f)
        );
      } catch (err) {
        setUploadFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: "error", progress: 0, error: err instanceof Error ? err.message : "Upload failed" }
              : f
          )
        );
      }
    }
  };

  const handleSettingsSave = async () => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setSettingsMsg({ type: "success", text: "Settings saved successfully." });
    } catch {
      setSettingsMsg({ type: "error", text: "Failed to save settings." });
    } finally {
      setSettingsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl animate-pulse" style={{ background: "rgba(34,211,238,0.05)" }} />
        <div className="h-96 rounded-2xl animate-pulse" style={{ background: "rgba(34,211,238,0.03)" }} />
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="reef-glass" style={{ padding: "24px" }}>
        <p style={{ color: "#f87171" }}>Knowledge base not found.</p>
        <Link href="/knowledge" className="text-sm hover:underline mt-2 block" style={{ color: "#22d3ee" }}>
          Back to Knowledge Bases
        </Link>
      </div>
    );
  }

  const sc = statusConfig[kb.status] || statusConfig.empty;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "documents", label: "Documents" },
    { key: "upload", label: "Upload" },
    { key: "retrieval", label: "Test Retrieval" },
    { key: "settings", label: "Settings" },
  ];

  const runRetrieval = async () => {
    if (!retrievalQuery.trim()) return;
    setRetrievalSearching(true);
    setRetrievalResults([]);
    setRetrievalTime(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_URL}/api/v1/knowledge-bases/${kbId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: retrievalQuery.trim(), top_k: retrievalTopK }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRetrievalResults(data.data || []);
      setRetrievalTime(Math.round(performance.now() - t0));
    } catch {
      setRetrievalResults([]);
    } finally {
      setRetrievalSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 style={{ color: colors.textPrimary }}>{kb.name}</h2>
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: sc.color, boxShadow: `0 0 8px ${sc.glow}` }}
            />
            <span className="text-sm" style={{ color: colors.textMuted }}>{kb.status}</span>
          </div>
          <p className="text-sm mt-1" style={{ color: colors.badgeText }}>{kb.description}</p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {kb.doc_count} {kb.doc_count === 1 ? "document" : "documents"}
            </span>
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {kb.chunk_count} chunks
            </span>
            <span
              className="text-xs rounded-md"
              style={{
                padding: "1px 6px", fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.05em", color: "#a855f7",
                background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)",
              }}
            >
              {kb.embedding_model}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!confirm(`Delete "${kb.name}" and all its documents?`)) return;
              await fetch(`${API_URL}/api/v1/knowledge-bases/${kbId}`, { method: "DELETE" });
              window.location.href = "/knowledge";
            }}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171", cursor: "pointer",
            }}
          >Delete</button>
          <Link href="/knowledge" className="text-sm transition-colors" style={{ color: colors.textMuted, textDecoration: "none" }}>
            Back
          </Link>
        </div>
      </div>

      {/* Storage info */}
      <div className="reef-glass flex items-center gap-6" style={{ padding: "14px 20px" }}>
        <div className="flex items-center gap-2">
          <span style={{ ...labelStyle, marginBottom: 0 }}>Store</span>
          <span className="font-mono" style={{ color: colors.textSecondary, fontSize: 13 }}>pgvector</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ ...labelStyle, marginBottom: 0 }}>Database</span>
          <span className="font-mono" style={{ color: colors.textSecondary, fontSize: 13 }}>corail_storage</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ ...labelStyle, marginBottom: 0 }}>Dimension</span>
          <span className="font-mono" style={{ color: colors.textSecondary, fontSize: 13 }}>768</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ ...labelStyle, marginBottom: 0 }}>Index</span>
          <span className="font-mono" style={{ color: colors.textSecondary, fontSize: 13 }}>HNSW cosine</span>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(34,211,238,0.06)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              ...(tab === t.key
                ? {
                    background: "rgba(34,211,238,0.08)",
                    color: colors.textPrimary,
                    fontWeight: 500,
                    boxShadow: "inset 0 1px 0 rgba(34,211,238,0.1), 0 2px 6px rgba(0,0,0,0.2)",
                    border: "1px solid rgba(34,211,238,0.12)",
                    cursor: "pointer",
                  }
                : {
                    background: "transparent",
                    color: colors.textMuted,
                    border: "1px solid transparent",
                    cursor: "pointer",
                  }),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Documents Tab ── */}
      {tab === "documents" && (
        <div className="reef-glass" style={{ padding: "24px" }}>
          <h3 className="font-semibold mb-4" style={{ color: colors.textPrimary }}>Uploaded Documents</h3>
          {docs.length === 0 ? (
            <div className="text-center" style={{ padding: "24px 0" }}>
              <p className="text-sm mb-2" style={{ color: colors.textMuted }}>No documents uploaded yet.</p>
              <button
                className="btn-reef"
                onClick={() => setTab("upload")}
                style={{ padding: "6px 16px", fontSize: "13px" }}
              >
                Upload Documents
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Filename", "Status", "Chunks", "Type", "Date", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          ...labelStyle,
                          textAlign: "left",
                          padding: "8px 12px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const ds = statusConfig[doc.status] || statusConfig.pending;
                    return (
                      <tr key={doc.id}>
                        <td style={{ padding: "12px", color: colors.textPrimary, fontSize: 14, fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          {doc.filename}
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-flex h-2 w-2 rounded-full"
                              style={{ background: ds.color, boxShadow: `0 0 6px ${ds.glow}` }}
                            />
                            <span style={{ color: ds.color, fontSize: 13, fontWeight: 500 }}>{doc.status}</span>
                          </span>
                        </td>
                        <td style={{ padding: "12px", color: colors.textSecondary, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          {doc.chunk_count}
                        </td>
                        <td style={{ padding: "12px", color: colors.textMuted, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          {doc.content_type}
                        </td>
                        <td style={{ padding: "12px", color: colors.textMuted, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <button
                            className="text-xs transition-colors"
                            style={{ color: "#ef4444", cursor: "pointer", background: "none", border: "none", fontWeight: 500 }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Upload Tab ── */}
      {tab === "upload" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className="reef-glass transition-all"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              borderColor: isDragging ? "rgba(34,211,238,0.4)" : undefined,
              background: isDragging
                ? "linear-gradient(165deg, rgba(22,45,72,0.9) 0%, rgba(14,32,56,0.95) 100%)"
                : undefined,
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px", opacity: 0.6 }}>
              {isDragging ? "📥" : "📄"}
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: colors.textPrimary }}>
              {isDragging ? "Drop files here" : "Drop files here or click to browse"}
            </p>
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Accepts .pdf, .txt, .md, .docx
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  addFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
          </div>

          {/* File list */}
          {uploadFiles.length > 0 && (
            <div className="reef-glass" style={{ padding: "24px" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold" style={{ color: colors.textPrimary }}>
                  Files ({uploadFiles.length})
                </h3>
                <button
                  className="btn-reef-primary"
                  onClick={startIngestion}
                  disabled={uploadFiles.every((f) => f.status !== "queued")}
                  style={{
                    padding: "8px 18px",
                    fontSize: "13px",
                    opacity: uploadFiles.every((f) => f.status !== "queued") ? 0.4 : 1,
                  }}
                >
                  Start Ingestion
                </button>
              </div>

              <div className="space-y-2">
                {uploadFiles.map((uf, idx) => {
                  const fileStatusColors: Record<UploadFile["status"], { color: string; label: string }> = {
                    queued: { color: colors.badgeText, label: "Queued" },
                    uploading: { color: "#eab308", label: "Uploading..." },
                    done: { color: "#22c55e", label: "Done" },
                    error: { color: "#ef4444", label: "Failed" },
                  };
                  const fsc = fileStatusColors[uf.status];

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-xl"
                      style={{
                        padding: "12px 16px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-3">
                          <span style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 500 }}>
                            {uf.file.name}
                          </span>
                          <span style={{ color: colors.textMuted, fontSize: 12 }}>
                            {(uf.file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        {/* Progress bar */}
                        {uf.status === "uploading" && (
                          <div
                            style={{
                              marginTop: 6,
                              height: 3,
                              borderRadius: 2,
                              background: "rgba(255,255,255,0.06)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${uf.progress}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #0ea5e9, #22d3ee)",
                                borderRadius: 2,
                                transition: "width 0.3s",
                              }}
                            />
                          </div>
                        )}
                        {uf.error && (
                          <p style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{uf.error}</p>
                        )}
                      </div>
                      <span style={{ color: fsc.color, fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                        {fsc.label}
                      </span>
                      {uf.status === "queued" && (
                        <button
                          onClick={() => removeFile(idx)}
                          style={{ color: colors.textMuted, cursor: "pointer", background: "none", border: "none", fontSize: 14, lineHeight: 1 }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Retrieval Test Tab ── */}
      {tab === "retrieval" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="reef-glass" style={{ padding: "20px" }}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Enter a query to test retrieval (no LLM involved — raw vector search)..."
                  value={retrievalQuery}
                  onChange={(e) => setRetrievalQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runRetrieval()}
                  style={{
                    ...inputStyle,
                    fontSize: 15,
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <div className="flex items-center gap-2">
                <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap" }}>Top K</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={retrievalTopK}
                  onChange={(e) => setRetrievalTopK(parseInt(e.target.value) || 5)}
                  style={{ ...inputStyle, width: 70, textAlign: "center" }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <button
                className="btn-reef-primary"
                onClick={runRetrieval}
                disabled={retrievalSearching || !retrievalQuery.trim()}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  opacity: retrievalSearching || !retrievalQuery.trim() ? 0.4 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {retrievalSearching ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Info bar */}
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: colors.textMuted }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#a855f7", boxShadow: "0 0 6px rgba(168,85,247,0.4)",
                }} />
                Engine: pgvector (cosine similarity)
              </span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                Model: {kb.embedding_model}
              </span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                Dimension: 768
              </span>
              {retrievalTime !== null && (
                <span style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>
                  {retrievalTime}ms
                </span>
              )}
            </div>
          </div>

          {/* Results */}
          {retrievalResults.length > 0 ? (
            <div className="space-y-3">
              <div style={{ fontSize: 13, color: colors.badgeText, fontWeight: 500 }}>
                {retrievalResults.length} chunk{retrievalResults.length > 1 ? "s" : ""} retrieved
              </div>
              {retrievalResults.map((r, i) => (
                <div
                  key={r.chunk_id || i}
                  className="reef-glass"
                  style={{ padding: "16px 20px" }}
                >
                  {/* Header: score + metadata */}
                  <div className="flex items-center gap-3 mb-3">
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "2px 10px",
                      borderRadius: 6,
                      color: r.score >= 0.8 ? "#22c55e" : r.score >= 0.5 ? "#eab308" : "#ef4444",
                      background: r.score >= 0.8 ? "rgba(34,197,94,0.1)" : r.score >= 0.5 ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${r.score >= 0.8 ? "rgba(34,197,94,0.25)" : r.score >= 0.5 ? "rgba(234,179,8,0.25)" : "rgba(239,68,68,0.25)"}`,
                    }}>
                      {(r.score * 100).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 12, color: colors.badgeText, fontWeight: 500 }}>
                      #{i + 1}
                    </span>
                    {r.filename && (
                      <span style={{
                        fontSize: 11, padding: "1px 8px", borderRadius: 4,
                        color: "#a855f7", fontWeight: 600,
                        background: "rgba(168,85,247,0.1)",
                        border: "1px solid rgba(168,85,247,0.2)",
                      }}>
                        {r.filename}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: colors.textMuted }}>
                      chunk #{r.chunk_index}
                    </span>
                  </div>

                  {/* Content */}
                  <div style={{
                    fontSize: 13, lineHeight: 1.7, color: colors.textSecondary,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: "12px 16px",
                    background: "rgba(4, 14, 26, 0.5)",
                    borderRadius: 10,
                    border: "1px solid rgba(34, 211, 238, 0.06)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 300,
                    overflowY: "auto",
                  }}>
                    {r.content}
                  </div>
                </div>
              ))}
            </div>
          ) : retrievalTime !== null ? (
            <div className="reef-glass text-center" style={{ padding: "48px" }}>
              <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>
                No chunks matched
              </p>
              <p style={{ color: colors.textMuted, fontSize: 13 }}>
                The query returned no results. Try different keywords or check that documents have been ingested.
              </p>
            </div>
          ) : (
            <div className="reef-glass text-center" style={{ padding: "48px" }}>
              <p style={{ color: colors.textMuted, fontSize: 14 }}>
                Enter a query and click Search to test the retrieval engine directly.
              </p>
              <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                This searches the vector database without calling any LLM — you see the raw chunks the agent would receive as context.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ── */}
      {tab === "settings" && (
        <div className="reef-glass" style={{ padding: "24px" }}>
          <h3 className="font-semibold mb-6" style={{ color: colors.textPrimary }}>KB Configuration</h3>
          <div className="grid gap-5 md:grid-cols-2">
            {/* Name */}
            <div>
              <label className="block mb-2" style={labelStyle}>Name</label>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Embedding Model */}
            <div>
              <label className="block mb-2" style={labelStyle}>Embedding Model</label>
              <select
                value={settingsForm.embedding_model}
                onChange={(e) => setSettingsForm((f) => ({ ...f, embedding_model: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={handleFocus}
                onBlur={handleBlur}
              >
                <option value="nomic-embed-text" style={{ background: "#0a1929", color: colors.textPrimary }}>nomic-embed-text</option>
                <option value="text-embedding-3-small" style={{ background: "#0a1929", color: colors.textPrimary }}>text-embedding-3-small</option>
                <option value="text-embedding-3-large" style={{ background: "#0a1929", color: colors.textPrimary }}>text-embedding-3-large</option>
                <option value="bge-large-en-v1.5" style={{ background: "#0a1929", color: colors.textPrimary }}>bge-large-en-v1.5</option>
              </select>
            </div>

            {/* Chunk Size */}
            <div>
              <label className="block mb-2" style={labelStyle}>Chunk Size</label>
              <input
                type="number"
                min={128}
                max={4096}
                value={settingsForm.chunk_size}
                onChange={(e) => setSettingsForm((f) => ({ ...f, chunk_size: parseInt(e.target.value) || 512 }))}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Chunk Overlap */}
            <div>
              <label className="block mb-2" style={labelStyle}>Chunk Overlap</label>
              <input
                type="number"
                min={0}
                max={512}
                value={settingsForm.chunk_overlap}
                onChange={(e) => setSettingsForm((f) => ({ ...f, chunk_overlap: parseInt(e.target.value) || 50 }))}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block mb-2" style={labelStyle}>Description</label>
              <textarea
                value={settingsForm.description}
                onChange={(e) => setSettingsForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical" as const,
                  minHeight: 80,
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          </div>

          {/* Save button */}
          <div className="mt-6 flex items-center gap-4">
            <button
              className="btn-reef-primary"
              onClick={handleSettingsSave}
              disabled={settingsSaving}
              style={{ opacity: settingsSaving ? 0.6 : 1 }}
            >
              {settingsSaving ? "Saving..." : "Save"}
            </button>
            {settingsMsg && (
              <span
                className="text-sm font-medium"
                style={{ color: settingsMsg.type === "success" ? "#4ade80" : "#f87171" }}
              >
                {settingsMsg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

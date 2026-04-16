"use client";
import { getAuthHeaders } from "@/lib/auth";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  doc_count: number;
  chunk_count: number;
  embedding_model: string;
  status: "ready" | "processing" | "empty";
  created_at: string;
}

const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  ready: { color: "#22c55e", glow: "rgba(34,197,94,0.5)", label: "Ready" },
  processing: { color: "#eab308", glow: "rgba(234,179,8,0.5)", label: "Processing" },
  empty: { color: "#64748b", glow: "rgba(100,116,139,0.3)", label: "Empty" },
};

export default function KnowledgeListPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    fetch(`${API_URL}/api/v1/knowledge-bases`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setKbs(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Knowledge Base</h2>
        <Link href="/knowledge/new" className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px", textDecoration: "none" }}>
          + Create KB
        </Link>
      </div>

      {kbs.length === 0 ? (
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>No knowledge bases</p>
          <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
            Create your first knowledge base to enable RAG for your agents.
          </p>
          <Link href="/knowledge/new" className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px", textDecoration: "none" }}>
            Create KB
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {kbs.map((kb) => {
            const status = statusConfig[kb.status];
            return (
              <Link
                href={`/knowledge/${kb.id}`}
                key={kb.id}
                className="reef-glass transition-all block"
                style={{ padding: "24px", textDecoration: "none" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.cardHoverBorder;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.cardBorder;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Header: Name + Status dot */}
                <div className="flex items-center justify-between mb-3">
                  <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>{kb.name}</h3>
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{
                      background: status.color,
                      boxShadow: `0 0 8px ${status.glow}`,
                    }}
                    title={status.label}
                  />
                </div>

                {/* Description */}
                <p className="text-sm mb-4" style={{ color: colors.textSecondary, fontWeight: 400 }}>
                  {kb.description}
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-xs"
                    style={{
                      padding: "2px 8px",
                      fontWeight: 500,
                      color: colors.badgeText,
                      background: colors.badgeBg,
                      borderRadius: "6px",
                      border: `1px solid ${colors.badgeBorder}`,
                    }}
                  >
                    {kb.doc_count} {kb.doc_count === 1 ? "document" : "documents"}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      padding: "2px 8px",
                      fontWeight: 500,
                      color: colors.badgeText,
                      background: colors.badgeBg,
                      borderRadius: "6px",
                      border: `1px solid ${colors.badgeBorder}`,
                    }}
                  >
                    {kb.chunk_count} chunks
                  </span>
                </div>

                {/* Embedding model badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs rounded-md"
                    style={{
                      padding: "2px 8px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#a855f7",
                      background: "rgba(168,85,247,0.1)",
                      border: "1px solid rgba(168,85,247,0.25)",
                    }}
                  >
                    {kb.embedding_model}
                  </span>
                </div>

                {/* Footer: Status + Date */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: status.color, fontWeight: 500 }}>
                    {status.label}
                  </span>
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    {kb.created_at}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

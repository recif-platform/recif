"use client";

import { useEffect, useState } from "react";
import { Agent, fetchAgents } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const phaseColors: Record<string, { dot: string; glow: string }> = {
  Running: { dot: "#22c55e", glow: "rgba(34,197,94,0.6)" },
  Pending: { dot: "#eab308", glow: "rgba(234,179,8,0.6)" },
  Failed: { dot: "#ef4444", glow: "rgba(239,68,68,0.6)" },
  Stopped: { dot: "#94a3b8", glow: "rgba(148,163,184,0.4)" },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 style={{ color: colors.textPrimary }}>Agents</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl animate-pulse"
              style={{ background: colors.accentBg }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 style={{ color: colors.textPrimary }}>Agents</h2>
        <div className="reef-glass" style={{ padding: "24px" }}>
          <p style={{ color: "#f87171" }}>Failed to load agents. Please check that the API is running.</p>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 style={{ color: colors.textPrimary }}>Agents</h2>
          <a href="/agents/new" className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
            + Create Agent
          </a>
        </div>
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>No agents yet</p>
          <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
            Get started with the wizard or CLI:
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/agents/new" className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
              Create with Wizard
            </a>
            <code
              className="text-sm"
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                background: colors.badgeBg,
                border: `1px solid ${colors.accentBorder}`,
                color: colors.accent,
              }}
            >
              recif init my-agent
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Agents</h2>
        <a href="/agents/new" className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
          + Create Agent
        </a>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const phase = agent.phase || (agent.status === "deployed" ? "Running" : agent.status === "registered" ? "Created" : agent.status);
          const pc = phaseColors[phase] || { dot: "#94a3b8", glow: "rgba(148,163,184,0.4)" };
          return (
            <a
              href={`/agents/${agent.id}`}
              key={agent.id}
              className="reef-glass block transition-all cursor-pointer"
              style={{ padding: "24px" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.cardHoverBorder;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.cardBorder;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>{agent.name}</h3>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ background: pc.dot, boxShadow: `0 0 8px ${pc.glow}` }}
                  />
                  <span className="text-xs font-semibold" style={{ color: pc.dot }}>{phase}</span>
                </div>
              </div>
              {agent.description && (
                <p className="text-sm mb-3" style={{ color: colors.textMuted, lineHeight: 1.5 }}>
                  {agent.description}
                </p>
              )}
              {/* Framework + Model */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-block rounded-lg text-xs font-semibold"
                  style={{
                    padding: "3px 10px",
                    background: colors.accentBg,
                    border: `1px solid ${colors.accentBorder}`,
                    color: colors.accent,
                  }}
                >
                  {agent.framework.toUpperCase()}
                </span>
                {(agent.model_type || agent.model_id) && (
                  <span
                    className="inline-block rounded-lg text-xs font-medium font-mono"
                    style={{
                      padding: "3px 10px",
                      background: colors.badgeBg,
                      border: `1px solid ${colors.badgeBorder}`,
                      color: colors.badgeText,
                    }}
                  >
                    {agent.model_type && agent.model_id
                      ? `${agent.model_type}/${agent.model_id}`
                      : agent.model_type || agent.model_id}
                  </span>
                )}
              </div>

              {/* Skills */}
              {agent.skills && agent.skills.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Skills</span>
                  {agent.skills.map((s) => (
                    <span
                      key={s}
                      className="text-xs rounded-md"
                      style={{
                        padding: "1px 7px",
                        fontWeight: 500,
                        color: "#a78bfa",
                        background: "rgba(167,139,250,0.1)",
                        border: "1px solid rgba(167,139,250,0.2)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Tools */}
              {agent.tools && agent.tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tools</span>
                  {agent.tools.map((t) => (
                    <span
                      key={t}
                      className="text-xs rounded-md"
                      style={{
                        padding: "1px 7px",
                        fontWeight: 500,
                        color: "#22c55e",
                        background: "rgba(34,197,94,0.1)",
                        border: "1px solid rgba(34,197,94,0.2)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Knowledge Bases */}
              {((agent.knowledgeBases && agent.knowledgeBases.length > 0) || (agent.knowledge_bases && agent.knowledge_bases.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>KBs</span>
                  {(agent.knowledgeBases || agent.knowledge_bases || []).map((kb) => (
                    <span
                      key={kb}
                      className="text-xs rounded-md"
                      style={{
                        padding: "1px 7px",
                        fontWeight: 500,
                        color: "#f97316",
                        background: "rgba(249,115,22,0.1)",
                        border: "1px solid rgba(249,115,22,0.2)",
                      }}
                    >
                      {kb}
                    </span>
                  ))}
                </div>
              )}

              {/* Channel + Storage */}
              <div className="flex flex-wrap items-center gap-2 mt-2 pt-2" style={{ borderTop: `1px solid ${colors.divider}` }}>
                {agent.channel && (
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Channel: <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.channel}</span>
                  </span>
                )}
                {agent.storage && (
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Storage: <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.storage}</span>
                  </span>
                )}
                {agent.strategy && (
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Strategy: <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.strategy}</span>
                  </span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

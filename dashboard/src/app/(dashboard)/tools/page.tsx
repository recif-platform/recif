"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchIntegrations, type Integration } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS = ["Built-in", "Integration", "Custom"] as const;
type Tab = (typeof TABS)[number];

interface BuiltinTool {
  id: string;
  name: string;
  description: string;
}

const BUILTIN_TOOLS: BuiltinTool[] = [
  { id: "datetime", name: "Date & Time", description: "Get current date, time, and timezone info" },
  { id: "calculator", name: "Calculator", description: "Evaluate mathematical expressions" },
  { id: "web_search", name: "Web Search", description: "Search the web via DuckDuckGo or SearXNG" },
];

interface CustomTool {
  id: string;
  name: string;
  type: "http" | "cli";
  description: string;
  endpoint?: string;
  command?: string;
}

const typeBadgeColors: Record<string, { bg: string; border: string; color: string }> = {
  builtin:     { bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.25)", color: "#22d3ee" },
  integration: { bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.25)", color: "#a855f7" },
  http:        { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", color: "#22c55e" },
  cli:         { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
};

/* ------------------------------------------------------------------ */
/*  Custom Tool Modal                                                  */
/* ------------------------------------------------------------------ */

interface CustomToolForm {
  name: string;
  type: "http" | "cli";
  description: string;
  endpoint: string;
  command: string;
}

function emptyToolForm(): CustomToolForm {
  return { name: "", type: "http", description: "", endpoint: "", command: "" };
}

function CustomToolModal({
  initial,
  onSave,
  onClose,
  colors,
}: {
  initial: CustomToolForm;
  onSave: (data: CustomToolForm) => void;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [form, setForm] = useState<CustomToolForm>(initial);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: colors.overlayBg, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="reef-glass" style={{ width: 480, padding: "28px", borderColor: colors.accentBorder }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          {initial.name ? "Edit Tool" : "Create Tool"}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-tool"
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
              }}
            />
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Type</label>
            <div className="flex gap-2">
              {(["http", "cli"] as const).map((t) => {
                const badge = typeBadgeColors[t];
                const selected = form.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    style={{
                      padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: "pointer", textTransform: "uppercase",
                      color: selected ? colors.textInverse : badge.color,
                      background: selected ? badge.color : badge.bg,
                      border: `1px solid ${selected ? "transparent" : badge.border}`,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this tool do?"
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
              }}
            />
          </div>

          {form.type === "http" && (
            <div>
              <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Endpoint URL</label>
              <input
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://api.example.com/tool"
                style={{
                  width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                  borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13, fontFamily: "monospace",
                }}
              />
            </div>
          )}

          {form.type === "cli" && (
            <div>
              <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Command</label>
              <input
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="kubectl get pods"
                style={{
                  width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                  borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13, fontFamily: "monospace",
                }}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={onClose}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                color: colors.badgeText, background: "transparent",
                border: `1px solid ${colors.badgeBorder}`, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={!form.name.trim()}
              className="btn-reef-primary"
              style={{ padding: "8px 18px", fontSize: "13px", opacity: form.name.trim() ? 1 : 0.4 }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const LS_KEY = "recif-custom-tools";

function loadCustomTools(): CustomTool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomTools(tools: CustomTool[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(tools));
}

export default function ToolsPage() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("Built-in");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomTool | null>(null);

  useEffect(() => {
    setCustomTools(loadCustomTools());
  }, []);

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true);
    try {
      const data = await fetchIntegrations();
      setIntegrations(data);
    } catch {
      setIntegrations([]);
    } finally {
      setLoadingIntegrations(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "Integration") {
      loadIntegrations();
    }
  }, [tab, loadIntegrations]);

  /* Integration tools: derive from integrations' exposed_tools via known types */
  const integrationToolTypeMap: Record<string, string[]> = {
    github:    ["github_list_repos", "github_create_issue", "github_list_prs", "github_merge_pr"],
    jira:      ["jira_list_issues", "jira_create_issue", "jira_update_issue"],
    jenkins:   ["jenkins_list_jobs", "jenkins_trigger_build", "jenkins_build_status"],
    slack:     ["slack_send_message", "slack_list_channels"],
    aws:       ["aws_list_resources", "aws_describe_instance"],
    gcp:       ["gcp_list_resources", "gcp_describe_instance"],
    datadog:   ["datadog_query_metrics", "datadog_list_monitors", "datadog_create_alert"],
    terraform: ["terraform_list_workspaces", "terraform_plan_status", "terraform_apply"],
  };

  const integrationTools = integrations.flatMap((intg) => {
    const tools = integrationToolTypeMap[intg.type] ?? [];
    return tools.map((t) => ({
      name: t,
      description: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      source: intg.name || intg.type,
    }));
  });

  /* Custom tools CRUD */
  const openCreate = () => {
    setEditingTool(null);
    setModalOpen(true);
  };

  const openEdit = (tool: CustomTool) => {
    setEditingTool(tool);
    setModalOpen(true);
  };

  const handleSaveTool = (data: CustomToolForm) => {
    const updated = [...customTools];
    if (editingTool) {
      const idx = updated.findIndex((t) => t.id === editingTool.id);
      if (idx >= 0) {
        updated[idx] = { ...editingTool, ...data };
      }
    } else {
      updated.push({
        id: `custom-${Date.now()}`,
        name: data.name,
        type: data.type,
        description: data.description,
        endpoint: data.endpoint || undefined,
        command: data.command || undefined,
      });
    }
    setCustomTools(updated);
    saveCustomTools(updated);
    setModalOpen(false);
    setEditingTool(null);
  };

  const handleDeleteTool = (id: string) => {
    const updated = customTools.filter((t) => t.id !== id);
    setCustomTools(updated);
    saveCustomTools(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: colors.textPrimary, fontWeight: 800, fontSize: "22px" }}>Tools</h2>
          <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
            Extend agent capabilities with built-in, integration, and custom tools.
          </p>
        </div>
        <button
          className="btn-reef-primary"
          style={{ padding: "8px 18px", fontSize: "13px" }}
          onClick={openCreate}
        >
          + Create Tool
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((t) => {
          const isActive = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-lg transition-all"
              style={{
                padding: "6px 14px", fontSize: "12px",
                fontWeight: isActive ? 600 : 450,
                color: isActive ? colors.accent : colors.badgeText,
                background: isActive ? colors.accentBg : colors.badgeBg,
                border: isActive ? `1px solid ${colors.accentBorder}` : `1px solid ${colors.badgeBorder}`,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Built-in Tab */}
      {tab === "Built-in" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BUILTIN_TOOLS.map((tool) => {
            const badge = typeBadgeColors.builtin;
            return (
              <div
                key={tool.id}
                className="reef-glass transition-all"
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
                <div className="flex items-center justify-between mb-3">
                  <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>{tool.name}</h3>
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }}
                  />
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs rounded-md"
                    style={{
                      padding: "2px 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                    }}
                  >
                    built-in
                  </span>
                </div>

                <p className="text-sm mb-3" style={{ color: colors.textSecondary, fontWeight: 400 }}>
                  {tool.description}
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>Read-only</span>
                  <button
                    disabled
                    style={{
                      marginLeft: "auto", padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      color: colors.badgeText, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
                      cursor: "not-allowed", opacity: 0.5,
                    }}
                  >
                    Test
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Integration Tab */}
      {tab === "Integration" && (
        <>
          {loadingIntegrations ? (
            <div className="reef-glass text-center" style={{ padding: "48px", color: colors.textMuted }}>
              Loading integration tools...
            </div>
          ) : integrationTools.length === 0 ? (
            <div className="reef-glass text-center" style={{ padding: "48px" }}>
              <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>
                No integration tools available
              </p>
              <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
                Connect integrations to unlock more tools.
              </p>
              <a
                href="/integrations"
                className="btn-reef-primary"
                style={{ padding: "8px 18px", fontSize: "13px", textDecoration: "none" }}
              >
                Go to Integrations
              </a>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {integrationTools.map((tool) => {
                const badge = typeBadgeColors.integration;
                return (
                  <div
                    key={tool.name}
                    className="reef-glass transition-all"
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
                    <h3 className="mb-2" style={{ color: colors.textPrimary, fontWeight: 700 }}>{tool.name}</h3>

                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="text-xs rounded-md"
                        style={{
                          padding: "2px 8px", fontWeight: 600, letterSpacing: "0.05em",
                          color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                        }}
                      >
                        via {tool.source}
                      </span>
                    </div>

                    <p className="text-sm" style={{ color: colors.textSecondary, fontWeight: 400 }}>
                      {tool.description}
                    </p>

                    <p className="mt-3 text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>
                      Read-only
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Custom Tab */}
      {tab === "Custom" && (
        <>
          {customTools.length === 0 ? (
            <div className="reef-glass text-center" style={{ padding: "48px" }}>
              <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>
                No custom tools yet
              </p>
              <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
                Create HTTP or CLI tools to extend your agents.
              </p>
              <button
                className="btn-reef-primary"
                style={{ padding: "8px 18px", fontSize: "13px" }}
                onClick={openCreate}
              >
                + Create Tool
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {customTools.map((tool) => {
                const badge = typeBadgeColors[tool.type];
                return (
                  <div
                    key={tool.id}
                    className="reef-glass transition-all"
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
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>{tool.name}</h3>
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }}
                      />
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="text-xs rounded-md"
                        style={{
                          padding: "2px 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                          color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                        }}
                      >
                        {tool.type}
                      </span>
                    </div>

                    <p className="text-sm mb-3" style={{ color: colors.textSecondary, fontWeight: 400 }}>
                      {tool.description}
                    </p>

                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => openEdit(tool)}
                        style={{
                          padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTool(tool.id)}
                        style={{
                          padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <CustomToolModal
          initial={
            editingTool
              ? {
                  name: editingTool.name,
                  type: editingTool.type,
                  description: editingTool.description,
                  endpoint: editingTool.endpoint ?? "",
                  command: editingTool.command ?? "",
                }
              : emptyToolForm()
          }
          onSave={handleSaveTool}
          onClose={() => {
            setModalOpen(false);
            setEditingTool(null);
          }}
          colors={colors}
        />
      )}
    </div>
  );
}

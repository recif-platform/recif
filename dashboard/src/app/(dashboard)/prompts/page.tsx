"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import { fetchPrompts, createPrompt, setPromptAlias } from "@/lib/api";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newCommit, setNewCommit] = useState("");
  const [error, setError] = useState("");
  const { colors } = useTheme();

  const loadPrompts = useCallback(async () => {
    try {
      setPrompts(await fetchPrompts());
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  const handleCreate = async () => {
    const name = newName.trim();
    const template = newTemplate.trim();
    if (!name || !template) { setError("Name and template are required"); return; }
    setError("");
    try {
      await createPrompt(name, template, newCommit.trim() || `Created ${name}`);
      setNewName(""); setNewTemplate(""); setNewCommit("");
      await loadPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create prompt");
    }
  };

  const handleSetAlias = async (promptName: string, alias: string, version: number) => {
    try {
      await setPromptAlias(promptName, alias, version);
      await loadPrompts();
    } catch {}
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h2 style={{ color: colors.textPrimary }}>Prompts</h2>
      <p style={{ color: colors.textMuted, fontSize: 14 }}>
        Versioned prompt templates managed via MLflow Prompt Registry. Reference prompts in agents by name and alias.
      </p>

      {/* Prompt list */}
      <div className="space-y-3">
        {loading ? (
          [1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />
          ))
        ) : prompts.length === 0 ? (
          <div className="reef-glass" style={{ padding: "24px", textAlign: "center" }}>
            <p style={{ color: colors.textMuted }}>No prompts yet. Create one below.</p>
          </div>
        ) : (
          prompts.map((p: any) => {
            const name = p.name || p.prompt?.name || "unknown";
            const versions = p.versions || p.prompt?.versions || [];
            const aliases = p.aliases || p.prompt?.aliases || {};
            const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

            return (
              <div key={name} className="reef-glass" style={{ padding: "16px 20px" }}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setExpanded(expanded === name ? null : name)}
                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, padding: 0 }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 20 }}>📝</span>
                      <div>
                        <p style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{name}</p>
                        <div className="flex gap-2" style={{ marginTop: 2 }}>
                          {Object.entries(aliases).map(([alias, ver]) => (
                            <span key={alias} style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                              background: alias === "champion" ? "rgba(34,197,94,0.15)" : "rgba(34,211,238,0.15)",
                              color: alias === "champion" ? "#22c55e" : "#22d3ee",
                            }}>
                              @{alias} → v{String(ver)}
                            </span>
                          ))}
                          <span style={{ fontSize: 11, color: colors.textMuted }}>
                            {versions.length} version{versions.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <span style={{
                    fontSize: 11, color: colors.textMuted,
                    transform: expanded === name ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s", display: "inline-block",
                  }}>&#9660;</span>
                </div>

                {expanded === name && (
                  <div style={{ marginTop: 16 }}>
                    {/* Versions */}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${colors.divider}` }}>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: colors.textMuted, fontWeight: 500 }}>Version</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: colors.textMuted, fontWeight: 500 }}>Template</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: colors.textMuted, fontWeight: 500 }}>Aliases</th>
                          <th style={{ textAlign: "right", padding: "6px 10px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.map((v: any) => {
                          const ver = v.version || v;
                          const template = v.template || "";
                          const vAliases = Object.entries(aliases).filter(([, vv]) => String(vv) === String(ver)).map(([a]) => a);
                          return (
                            <tr key={ver} style={{ borderBottom: `1px solid ${colors.divider}` }}>
                              <td style={{ padding: "6px 10px", color: "#22d3ee", fontWeight: 600 }}>v{ver}</td>
                              <td style={{ padding: "6px 10px", color: colors.textSecondary, fontFamily: "monospace", fontSize: 12, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {template.slice(0, 100)}{template.length > 100 ? "…" : ""}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                {vAliases.map((a) => (
                                  <span key={a} style={{
                                    fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, marginRight: 4,
                                    background: a === "champion" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                                    color: a === "champion" ? "#22c55e" : "#eab308",
                                  }}>@{a}</span>
                                ))}
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                <button
                                  onClick={() => handleSetAlias(name, "champion", Number(ver))}
                                  style={{
                                    fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontWeight: 500,
                                    background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)",
                                  }}
                                >
                                  Set @champion
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* New version */}
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500, marginBottom: 6 }}>Add New Version</p>
                      <textarea
                        placeholder="Template text with {{ variables }}..."
                        className="w-full rounded-xl text-sm outline-none"
                        style={{
                          padding: "10px 14px", minHeight: 80, background: colors.inputBg,
                          border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary,
                          fontFamily: "monospace", resize: "vertical",
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.metaKey) {
                            const ta = e.currentTarget;
                            createPrompt(name, ta.value.trim(), "Updated via dashboard").then(loadPrompts);
                            ta.value = "";
                          }
                        }}
                      />
                      <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>Press Cmd+Enter to save new version</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create new prompt */}
      <div className="reef-glass" style={{ padding: "20px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Create New Prompt</h3>
        {error && (
          <div style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="space-y-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Prompt name (e.g., support-bot-prompt)"
            className="w-full rounded-xl text-sm outline-none"
            style={{ padding: "10px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary, fontFamily: "monospace" }}
          />
          <textarea
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            placeholder={"You are a helpful assistant.\n\nUse {{ variable }} syntax for template variables."}
            className="w-full rounded-xl text-sm outline-none"
            rows={6}
            style={{ padding: "10px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary, fontFamily: "monospace", resize: "vertical" }}
          />
          <input
            value={newCommit}
            onChange={(e) => setNewCommit(e.target.value)}
            placeholder="Commit message (optional)"
            className="w-full rounded-xl text-sm outline-none"
            style={{ padding: "10px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }}
          />
          <button onClick={handleCreate} className="btn-reef-primary" style={{ padding: "10px 20px", fontSize: 13 }}>
            Create Prompt
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchSkills,
  fetchAgents,
  createSkill,
  updateSkill,
  deleteSkill,
  importSkill,
  type Skill,
  type Agent,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS = ["Built-in", "Custom", "Import"] as const;
type Tab = (typeof TABS)[number];

const CATEGORIES = ["general", "rendering", "analysis", "writing"] as const;

const categoryStyle: Record<string, { color: string; bg: string; border: string }> = {
  rendering: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.25)" },
  analysis:  { color: "#a855f7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.25)" },
  writing:   { color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
  general:   { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.25)" },
};

const AVAILABLE_TOOLS = ["datetime", "calculator", "web_search"];

const CHANNEL_OPTIONS = ["rest", "slack", "teams", "discord"];

/** Known Anthropic skills from https://github.com/anthropics/skills */
const ANTHROPIC_SKILLS = [
  { name: "algorithmic-art", description: "Generate algorithmic art and creative coding visuals.", category: "rendering" },
  { name: "brand-guidelines", description: "Create and enforce brand identity guidelines.", category: "writing" },
  { name: "canvas-design", description: "Design visual layouts and canvas-based compositions.", category: "rendering" },
  { name: "claude-api", description: "Expert guidance on Claude API integration and usage.", category: "general" },
  { name: "doc-coauthoring", description: "Collaborative document writing and editing.", category: "writing" },
  { name: "docx", description: "Generate and manipulate DOCX Word documents.", category: "writing" },
  { name: "frontend-design", description: "Design modern frontend interfaces and components.", category: "rendering" },
  { name: "internal-comms", description: "Craft internal communications and announcements.", category: "writing" },
  { name: "mcp-builder", description: "Build Model Context Protocol servers and tools.", category: "general" },
  { name: "pdf", description: "Generate and process PDF documents.", category: "writing" },
  { name: "pptx", description: "Create PowerPoint presentations programmatically.", category: "writing" },
  { name: "skill-creator", description: "Meta-skill: create new skills from requirements.", category: "general" },
  { name: "slack-gif-creator", description: "Create animated GIFs for Slack reactions.", category: "rendering" },
  { name: "theme-factory", description: "Generate design system themes and color palettes.", category: "rendering" },
  { name: "web-artifacts-builder", description: "Build interactive web artifacts and components.", category: "rendering" },
  { name: "webapp-testing", description: "Test web applications with automated checks.", category: "analysis" },
  { name: "xlsx", description: "Generate and manipulate Excel spreadsheets.", category: "analysis" },
] as const;

/* ------------------------------------------------------------------ */
/*  Skill Form Data                                                    */
/* ------------------------------------------------------------------ */

interface SkillFormData {
  name: string;
  description: string;
  category: string;
  channel_filter: string[];
  instructions: string;
  tools: string[];
  version: string;
  author: string;
  source: string;
  compatibility: string[];
  scripts: Record<string, string>;
  references: Record<string, string>;
  assets: Record<string, string>;
}

function emptyForm(): SkillFormData {
  return {
    name: "", description: "", category: "general", channel_filter: [],
    instructions: "", tools: [], version: "1.0.0", author: "", source: "",
    compatibility: [], scripts: {}, references: {}, assets: {},
  };
}

/* ------------------------------------------------------------------ */
/*  Script/Reference Editor                                            */
/* ------------------------------------------------------------------ */

function KeyValueEditor({
  label,
  entries,
  onChange,
  colors,
}: {
  label: string;
  entries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const keys = Object.keys(entries);
  const [newKey, setNewKey] = useState("");

  const addEntry = () => {
    if (!newKey.trim() || entries[newKey.trim()]) return;
    onChange({ ...entries, [newKey.trim()]: "" });
    setNewKey("");
  };

  const removeEntry = (key: string) => {
    const next = { ...entries };
    delete next[key];
    onChange(next);
  };

  const updateContent = (key: string, content: string) => {
    onChange({ ...entries, [key]: content });
  };

  return (
    <div>
      <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>{label}</label>
      {keys.map((key) => (
        <div key={key} className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs" style={{ color: colors.textPrimary, fontWeight: 600, fontFamily: "monospace" }}>{key}</span>
            <button
              onClick={() => removeEntry(key)}
              className="text-xs"
              style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              Remove
            </button>
          </div>
          <textarea
            value={entries[key]}
            onChange={(e) => updateContent(key, e.target.value)}
            rows={4}
            style={{
              width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
              borderRadius: 6, color: colors.textPrimary, padding: "6px 10px", fontSize: 12,
              fontFamily: "monospace", resize: "vertical",
            }}
          />
        </div>
      ))}
      <div className="flex gap-2 items-center mt-1">
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="filename.py"
          onKeyDown={(e) => e.key === "Enter" && addEntry()}
          style={{
            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
            borderRadius: 6, color: colors.textPrimary, padding: "4px 8px", fontSize: 12, flex: 1,
          }}
        />
        <button
          onClick={addEntry}
          disabled={!newKey.trim()}
          style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
            color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
            opacity: newKey.trim() ? 1 : 0.4,
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

function SkillModal({
  initial,
  onSave,
  onClose,
  colors,
}: {
  initial: SkillFormData;
  onSave: (data: SkillFormData) => void;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [form, setForm] = useState<SkillFormData>(initial);
  const allChannels = form.channel_filter.length === 0;

  const toggleTool = (t: string) =>
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(t) ? f.tools.filter((x) => x !== t) : [...f.tools, t],
    }));

  const toggleChannel = (ch: string) =>
    setForm((f) => ({
      ...f,
      channel_filter: f.channel_filter.includes(ch)
        ? f.channel_filter.filter((x) => x !== ch)
        : [...f.channel_filter, ch],
    }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: colors.overlayBg, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="reef-glass" style={{ width: 620, padding: "28px", borderColor: colors.accentBorder, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          {initial.name ? "Edit Skill" : "Create Skill"}
        </h3>

        <div className="space-y-4">
          {/* Name + Version row */}
          <div className="flex gap-3">
            <div style={{ flex: 1 }}>
              <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="my-skill"
                style={{
                  width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                  borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
                }}
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Version</label>
              <input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0.0"
                style={{
                  width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                  borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this skill do? (~100 words, always in context)"
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
              }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Category</label>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => {
                const s = categoryStyle[cat];
                const selected = form.category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setForm({ ...form, category: cat })}
                    style={{
                      padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: "pointer", textTransform: "capitalize",
                      color: selected ? colors.textInverse : s.color,
                      background: selected ? s.color : s.bg,
                      border: `1px solid ${selected ? "transparent" : s.border}`,
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel filter */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>
              Channel Filter
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setForm({ ...form, channel_filter: [] })}
                style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  color: allChannels ? colors.textInverse : colors.badgeText,
                  background: allChannels ? colors.accent : colors.badgeBg,
                  border: `1px solid ${allChannels ? "transparent" : colors.badgeBorder}`,
                }}
              >
                All channels
              </button>
              {CHANNEL_OPTIONS.map((ch) => {
                const active = form.channel_filter.includes(ch);
                return (
                  <button
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      color: active ? colors.textInverse : colors.badgeText,
                      background: active ? colors.accent : colors.badgeBg,
                      border: `1px solid ${active ? "transparent" : colors.badgeBorder}`,
                    }}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Instructions (SKILL.md body)</label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Full markdown instructions loaded when the skill is activated..."
              rows={12}
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
                fontFamily: "monospace", resize: "vertical",
              }}
            />
          </div>

          {/* Associated Tools */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>Associated Tools</label>
            <div className="flex gap-2 flex-wrap">
              {AVAILABLE_TOOLS.map((t) => {
                const active = form.tools.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTool(t)}
                    style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      color: active ? colors.textInverse : colors.badgeText,
                      background: active ? colors.accent : colors.badgeBg,
                      border: `1px solid ${active ? "transparent" : colors.badgeBorder}`,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scripts */}
          <KeyValueEditor
            label="Scripts"
            entries={form.scripts}
            onChange={(scripts) => setForm({ ...form, scripts })}
            colors={colors}
          />

          {/* References */}
          <KeyValueEditor
            label="References"
            entries={form.references}
            onChange={(references) => setForm({ ...form, references })}
            colors={colors}
          />

          {/* Actions */}
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
/*  File color helpers                                                 */
/* ------------------------------------------------------------------ */

const FILE_COLORS: Record<string, string> = {
  "SKILL.md": "#22d3ee",
  ".sh": "#22c55e",
  ".py": "#eab308",
  ".md": "#a855f7",
  ".ts": "#3b82f6",
  ".js": "#f59e0b",
  ".json": "#f97316",
};

function fileColor(filename: string): string {
  if (filename === "SKILL.md") return FILE_COLORS["SKILL.md"];
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return FILE_COLORS[ext] || "#94a3b8";
}

/* ------------------------------------------------------------------ */
/*  Skill Detail Panel                                                 */
/* ------------------------------------------------------------------ */

function SkillDetailPanel({
  skill,
  agents,
  onClose,
  onEdit,
  onDelete,
  onClone,
  onAssignAgent,
  onUnassignAgent,
  colors,
}: {
  skill: Skill;
  agents: Agent[];
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  onAssignAgent?: (agentId: string) => void;
  onUnassignAgent?: (agentId: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const cat = categoryStyle[skill.category] ?? categoryStyle.general;
  const [selectedAgent, setSelectedAgent] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // File viewer state: null = show tree, { folder, name } = show file content
  const [viewingFile, setViewingFile] = useState<{ folder: string; name: string } | null>(null);

  // Reset file viewer when skill changes
  useEffect(() => { setViewingFile(null); }, [skill.id]);

  // Which agents have this skill assigned?
  const assignedAgents = agents.filter((a) => (a.skills || []).includes(skill.id));
  const unassignedAgents = agents.filter((a) => !(a.skills || []).includes(skill.id));
  const scriptKeys = skill.scripts ? Object.keys(skill.scripts) : [];
  const referenceKeys = skill.references ? Object.keys(skill.references) : [];
  const assetKeys = skill.assets ? Object.keys(skill.assets) : [];

  // Build file content lookup
  const getFileContent = (folder: string, name: string): string => {
    if (folder === "root" && name === "SKILL.md") return skill.instructions || "(empty)";
    const source: Record<string, string> | undefined = {
      scripts: skill.scripts,
      references: skill.references,
      assets: skill.assets,
    }[folder];
    return source?.[name] || "(no content)";
  };

  // Tree line rendering helpers
  const TREE_PIPE = "\u2502   ";  // |
  const TREE_TEE  = "\u251C\u2500\u2500 "; // |-
  const TREE_ELL  = "\u2514\u2500\u2500 "; // └-
  const TREE_SPACE = "    ";

  type FolderEntry = { folder: string; label: string; files: string[] };
  const folders: FolderEntry[] = [
    { folder: "scripts", label: "scripts/", files: scriptKeys },
    { folder: "references", label: "references/", files: referenceKeys },
    { folder: "assets", label: "assets/", files: assetKeys },
  ];

  const renderTreeLine = (
    prefix: string,
    connector: string,
    label: React.ReactNode,
    onClick?: () => void,
  ) => (
    <div
      className="flex items-center"
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 12.5,
        lineHeight: "22px",
        cursor: onClick ? "pointer" : "default",
        borderRadius: 4,
        padding: "0 4px",
        marginLeft: -4,
        transition: "background 0.15s",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = colors.accentBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ color: colors.textMuted, whiteSpace: "pre", userSelect: "none" }}>
        {prefix}{connector}
      </span>
      {label}
    </div>
  );

  // File viewer panel
  const renderFileViewer = () => {
    if (!viewingFile) return null;
    const { folder, name } = viewingFile;
    const content = getFileContent(folder, name);
    const color = fileColor(name);
    const lines = content.split("\n");

    return (
      <div className="mb-4">
        {/* Breadcrumb header */}
        <div
          className="flex items-center gap-2 mb-2"
          style={{ fontSize: 12 }}
        >
          <button
            onClick={() => setViewingFile(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: colors.accent, fontWeight: 600, fontSize: 12, padding: 0,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {skill.name}
          </button>
          <span style={{ color: colors.textMuted }}>/</span>
          {folder !== "root" && (
            <>
              <span style={{ color: colors.textMuted, fontFamily: "monospace" }}>{folder}</span>
              <span style={{ color: colors.textMuted }}>/</span>
            </>
          )}
          <span style={{ color, fontWeight: 600, fontFamily: "monospace" }}>{name}</span>
        </div>

        {/* Code block */}
        <div
          style={{
            background: colors.codeBg,
            border: `1px solid ${colors.codeBorder}`,
            borderRadius: 8,
            maxHeight: 400,
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <div style={{ display: "flex", minWidth: "fit-content" }}>
            {/* Line numbers gutter */}
            <div
              style={{
                padding: "12px 0",
                borderRight: `1px solid ${colors.codeBorder}`,
                userSelect: "none",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 11,
                    lineHeight: "20px",
                    color: colors.textMuted,
                    opacity: 0.5,
                    padding: "0 10px 0 14px",
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {/* File content */}
            <pre
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 12,
                lineHeight: "20px",
                color: colors.textSecondary,
                padding: "12px 14px",
                margin: 0,
                whiteSpace: "pre",
                flex: 1,
              }}
            >
              {content}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  // File tree panel
  const renderFileTree = () => {
    const lastFolderIdx = folders.length - 1;

    return (
      <div className="mb-4">
        <label
          className="text-xs block mb-2"
          style={{ color: colors.badgeText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          Package Files
        </label>
        <div
          style={{
            background: colors.codeBg,
            border: `1px solid ${colors.codeBorder}`,
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          {/* Root folder name */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: 12.5,
              lineHeight: "22px",
              color: colors.textMuted,
              fontWeight: 600,
              marginBottom: 1,
            }}
          >
            <span style={{ color: colors.accent, marginRight: 6 }}>{skill.name}/</span>
          </div>

          {/* SKILL.md — always present */}
          {renderTreeLine(
            "",
            TREE_TEE,
            <span style={{ color: fileColor("SKILL.md"), fontWeight: 500 }}>SKILL.md</span>,
            () => setViewingFile({ folder: "root", name: "SKILL.md" }),
          )}

          {/* Folders: scripts/, references/, assets/ */}
          {folders.map((f, fi) => {
            const isLast = fi === lastFolderIdx;
            const connector = isLast ? TREE_ELL : TREE_TEE;
            const childPrefix = isLast ? TREE_SPACE : TREE_PIPE;

            return (
              <div key={f.folder}>
                {/* Folder line */}
                {renderTreeLine(
                  "",
                  connector,
                  <span style={{ color: colors.textMuted, fontWeight: 600 }}>{f.label}</span>,
                )}

                {/* Folder contents */}
                {f.files.length === 0 ? (
                  renderTreeLine(
                    childPrefix,
                    TREE_ELL,
                    <span style={{ color: colors.textMuted, opacity: 0.4, fontStyle: "italic", fontWeight: 400 }}>(empty)</span>,
                  )
                ) : (
                  f.files.map((file, fii) => {
                    const isLastFile = fii === f.files.length - 1;
                    return (
                      <div key={file}>
                        {renderTreeLine(
                          childPrefix,
                          isLastFile ? TREE_ELL : TREE_TEE,
                          <span style={{ color: fileColor(file), fontWeight: 500 }}>{file}</span>,
                          () => setViewingFile({ folder: f.folder, name: file }),
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: colors.overlayBg, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="reef-glass h-full overflow-y-auto"
        style={{ width: 560, padding: "28px", borderRadius: "0", borderRight: "none", borderTop: "none", borderBottom: "none" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 18 }}>{skill.name}</h3>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>{skill.description}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 16, cursor: "pointer",
              color: colors.badgeText, background: "none", border: "none",
            }}
          >
            x
          </button>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span
            className="text-xs rounded-md"
            style={{
              padding: "2px 8px", fontWeight: 600, textTransform: "capitalize",
              color: cat.color, background: cat.bg, border: `1px solid ${cat.border}`,
            }}
          >
            {skill.category}
          </span>
          {skill.version && (
            <span className="text-xs rounded-md" style={{
              padding: "2px 8px", fontWeight: 600,
              color: colors.badgeText, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
            }}>
              v{skill.version}
            </span>
          )}
          {skill.author && (
            <span className="text-xs rounded-md" style={{
              padding: "2px 8px", fontWeight: 600,
              color: colors.badgeText, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
            }}>
              by {skill.author}
            </span>
          )}
          {skill.source && (
            <span className="text-xs rounded-md" style={{
              padding: "2px 8px", fontWeight: 500, fontFamily: "monospace",
              color: colors.textMuted, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
            }}>
              {skill.source}
            </span>
          )}
          {skill.builtin && (
            <span className="text-xs rounded-md" style={{
              padding: "2px 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
              color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
            }}>
              built-in
            </span>
          )}
        </div>

        {/* Channel + Tools */}
        {(skill.channel_filter.length > 0 || skill.tools.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {skill.channel_filter.length > 0 && (
              <span className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>
                Channels: {skill.channel_filter.map((c) => c.toUpperCase()).join(", ")}
              </span>
            )}
            {skill.tools.length > 0 && skill.tools.map((t) => (
              <span key={t} className="text-xs rounded-md" style={{
                padding: "2px 8px", fontWeight: 500,
                color: colors.badgeText, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* File tree OR file viewer */}
        {viewingFile ? renderFileViewer() : renderFileTree()}

        {/* Used by agents */}
        {agents.length > 0 && (
          <div className="mb-4">
            <label className="text-xs block mb-2" style={{ color: colors.badgeText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Used by {assignedAgents.length > 0 ? `(${assignedAgents.length})` : ""}
            </label>

            {/* Assigned agents — with remove button */}
            {assignedAgents.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {assignedAgents.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                      color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                    }}
                  >
                    {a.name}
                    {onUnassignAgent && (
                      <button
                        onClick={async () => {
                          try {
                            await onUnassignAgent(a.id);
                            setFeedback({ type: "success", text: `Removed from ${a.name}` });
                            setTimeout(() => setFeedback(null), 2000);
                          } catch {
                            setFeedback({ type: "error", text: "Failed to remove" });
                          }
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "rgba(34,197,94,0.5)", fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2,
                        }}
                        title={`Remove from ${a.name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Not assigned to any agent yet.</p>
            )}

            {/* Assign to new agent */}
            {onAssignAgent && unassignedAgents.length > 0 && (
              <div className="flex gap-2">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  style={{
                    flex: 1, background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                    borderRadius: 8, color: colors.textPrimary, padding: "6px 10px", fontSize: 12,
                  }}
                >
                  <option value="">Add to agent...</option>
                  {unassignedAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!selectedAgent || !onAssignAgent) return;
                    try {
                      await onAssignAgent(selectedAgent);
                      const agentName = agents.find((a) => a.id === selectedAgent)?.name || "";
                      setFeedback({ type: "success", text: `Assigned to ${agentName}` });
                      setSelectedAgent("");
                      setTimeout(() => setFeedback(null), 2000);
                    } catch {
                      setFeedback({ type: "error", text: "Failed to assign" });
                    }
                  }}
                  disabled={!selectedAgent}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
                    opacity: selectedAgent ? 1 : 0.4,
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {/* Inline feedback */}
            {feedback && (
              <p style={{
                fontSize: 12, fontWeight: 500, marginTop: 6,
                color: feedback.type === "success" ? "#22c55e" : "#ef4444",
              }}>
                {feedback.text}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
          {skill.builtin && onClone && (
            <button
              onClick={onClone}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
              }}
            >
              Clone
            </button>
          )}
          {!skill.builtin && onEdit && (
            <button
              onClick={onEdit}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
              }}
            >
              Edit
            </button>
          )}
          {!skill.builtin && onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill Card                                                         */
/* ------------------------------------------------------------------ */

function SkillCard({
  skill,
  onClick,
  onEdit,
  onDelete,
  onClone,
  colors,
}: {
  skill: Skill;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const cat = categoryStyle[skill.category] ?? categoryStyle.general;
  const preview = skill.instructions
    ? (skill.instructions.length > 120 ? skill.instructions.slice(0, 120) + "..." : skill.instructions)
    : "";

  return (
    <div
      className="reef-glass transition-all"
      style={{ padding: "20px", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.cardHoverBorder;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between mb-2">
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 14 }}>{skill.name}</h3>
        <div className="flex gap-1 shrink-0">
          {skill.builtin && (
            <span
              className="text-xs rounded-md"
              style={{
                padding: "2px 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              built-in
            </span>
          )}
          {skill.version && (
            <span className="text-xs rounded-md" style={{
              padding: "2px 8px", fontWeight: 500,
              color: colors.badgeText, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`,
            }}>
              v{skill.version}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: colors.textSecondary, fontWeight: 400 }}>
        {skill.description}
      </p>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className="text-xs rounded-md"
          style={{
            padding: "2px 8px", fontWeight: 600, textTransform: "capitalize",
            color: cat.color, background: cat.bg, border: `1px solid ${cat.border}`,
          }}
        >
          {skill.category}
        </span>

        {skill.author && (
          <span className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>
            by {skill.author}
          </span>
        )}

        {skill.channel_filter && skill.channel_filter.length > 0 && (
          <span className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>
            {skill.channel_filter.map((c) => c.toUpperCase()).join(", ")} only
          </span>
        )}

        {skill.tools && skill.tools.length > 0 &&
          skill.tools.map((t) => (
            <span
              key={t}
              className="text-xs rounded-md"
              style={{
                padding: "2px 8px", fontWeight: 500,
                color: colors.badgeText, background: colors.badgeBg,
                border: `1px solid ${colors.badgeBorder}`, borderRadius: 6,
              }}
            >
              {t}
            </span>
          ))}
      </div>

      {/* Instructions preview */}
      {preview && (
        <div
          style={{
            fontSize: 12, fontFamily: "monospace", color: colors.textMuted, lineHeight: 1.5,
            padding: "6px 10px", borderRadius: 6,
            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
            overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {preview}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
        {skill.builtin && onClone && (
          <button
            onClick={onClone}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
            }}
          >
            Clone
          </button>
        )}
        {!skill.builtin && onEdit && (
          <button
            onClick={onEdit}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
            }}
          >
            Edit
          </button>
        )}
        {!skill.builtin && onDelete && (
          <button
            onClick={onDelete}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Import Tab                                                         */
/* ------------------------------------------------------------------ */

function ImportTab({
  onImported,
  colors,
}: {
  onImported: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [source, setSource] = useState("");
  const [token, setToken] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleImport = async (src: string) => {
    setImporting(src);
    setError("");
    setSuccess("");
    try {
      const skill = await importSkill(src, token || undefined);
      setSuccess(`Imported "${skill.name}" successfully.`);
      onImported();
    } catch (e) {
      setError(`Failed to import: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Manual import */}
      <div className="reef-glass" style={{ padding: "20px" }}>
        <h4 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Import from GitHub
        </h4>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: colors.badgeText, fontWeight: 600 }}>Skill Source</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="github:anthropics/skills/skills/pdf"
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
              }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: colors.badgeText, fontWeight: 600 }}>GitHub Token (optional)</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              type="password"
              style={{
                width: "100%", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8, color: colors.textPrimary, padding: "8px 12px", fontSize: 13,
              }}
            />
          </div>
          <button
            onClick={() => source.trim() && handleImport(source.trim())}
            disabled={!source.trim() || importing !== null}
            className="btn-reef-primary"
            style={{ padding: "8px 18px", fontSize: "13px", opacity: source.trim() && !importing ? 1 : 0.4 }}
          >
            {importing === source.trim() ? "Importing..." : "Import"}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm" style={{ color: "#f87171" }}>{error}</div>
        )}
        {success && (
          <div className="mt-3 text-sm" style={{ color: "#22c55e" }}>{success}</div>
        )}
      </div>

      {/* Available Anthropic skills */}
      <div>
        <h4 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Available from anthropics/skills
        </h4>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ANTHROPIC_SKILLS.map((skill) => {
            const cat = categoryStyle[skill.category] ?? categoryStyle.general;
            const src = `github:anthropics/skills/skills/${skill.name}`;
            const isImporting = importing === src;
            return (
              <div
                key={skill.name}
                className="reef-glass transition-all"
                style={{ padding: "16px" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.cardHoverBorder;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.cardBorder;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h5 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 13 }}>{skill.name}</h5>
                  <span
                    className="text-xs rounded-md shrink-0"
                    style={{
                      padding: "2px 6px", fontWeight: 600, textTransform: "capitalize",
                      color: cat.color, background: cat.bg, border: `1px solid ${cat.border}`, fontSize: 10,
                    }}
                  >
                    {skill.category}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary, lineHeight: 1.4 }}>
                  {skill.description}
                </p>
                <button
                  onClick={() => handleImport(src)}
                  disabled={isImporting || importing !== null}
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    color: colors.accent, background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
                    opacity: importing !== null && !isImporting ? 0.4 : 1,
                  }}
                >
                  {isImporting ? "Importing..." : "Import"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SkillsPage() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("Built-in");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [cloneSource, setCloneSource] = useState<Skill | null>(null);

  // Detail panel state
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSkills();
      setSkills(data);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch {
      setAgents([]);
    }
  }, []);

  useEffect(() => {
    loadSkills();
    loadAgents();
  }, [loadSkills, loadAgents]);

  const builtinSkills = skills.filter((s) => s.builtin);
  const customSkills = skills.filter((s) => !s.builtin);

  const openCreate = () => {
    setEditingSkill(null);
    setCloneSource(null);
    setModalOpen(true);
  };

  const openEdit = (s: Skill) => {
    setEditingSkill(s);
    setCloneSource(null);
    setDetailSkill(null);
    setModalOpen(true);
  };

  const openClone = (s: Skill) => {
    setEditingSkill(null);
    setCloneSource(s);
    setDetailSkill(null);
    setModalOpen(true);
  };

  const handleSave = async (data: SkillFormData) => {
    try {
      if (editingSkill) {
        await updateSkill(editingSkill.id, data);
      } else {
        await createSkill(data);
      }
      setModalOpen(false);
      setEditingSkill(null);
      setCloneSource(null);
      loadSkills();
    } catch {
      // handle error silently for now
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSkill(id);
      setDetailSkill(null);
      loadSkills();
    } catch {
      // handle error silently for now
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!detailSkill) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const skillId = detailSkill.id;

    // Get current skills from local state
    const agent = agents.find((a) => a.id === agentId);
    const currentSkills = agent?.skills || [];
    if (currentSkills.includes(skillId)) return;
    const newSkills = [...currentSkills, skillId];

    // Persist to DB via dedicated endpoint
    const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: newSkills }),
    });
    if (!res.ok) throw new Error("Failed to assign");

    // Refresh agents from server
    await loadAgents();
  };

  const handleUnassignAgent = async (agentId: string) => {
    if (!detailSkill) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const skillId = detailSkill.id;

    const agent = agents.find((a) => a.id === agentId);
    const currentSkills = agent?.skills || [];
    const newSkills = currentSkills.filter((s) => s !== skillId);

    const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: newSkills }),
    });
    if (!res.ok) throw new Error("Failed to unassign");

    await loadAgents();
  };

  const getInitialFormData = (): SkillFormData => {
    if (editingSkill) {
      return {
        name: editingSkill.name,
        description: editingSkill.description,
        category: editingSkill.category,
        channel_filter: editingSkill.channel_filter || [],
        instructions: editingSkill.instructions || "",
        tools: editingSkill.tools || [],
        version: editingSkill.version || "1.0.0",
        author: editingSkill.author || "",
        source: editingSkill.source || "",
        compatibility: editingSkill.compatibility || [],
        scripts: editingSkill.scripts || {},
        references: editingSkill.references || {},
        assets: editingSkill.assets || {},
      };
    }
    if (cloneSource) {
      return {
        name: `${cloneSource.name} (copy)`,
        description: cloneSource.description,
        category: cloneSource.category,
        channel_filter: [...(cloneSource.channel_filter || [])],
        instructions: cloneSource.instructions || "",
        tools: [...(cloneSource.tools || [])],
        version: cloneSource.version || "1.0.0",
        author: cloneSource.author || "",
        source: cloneSource.source || "",
        compatibility: [...(cloneSource.compatibility || [])],
        scripts: { ...(cloneSource.scripts || {}) },
        references: { ...(cloneSource.references || {}) },
        assets: { ...(cloneSource.assets || {}) },
      };
    }
    return emptyForm();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: colors.textPrimary, fontWeight: 800, fontSize: "22px" }}>Skills</h2>
          <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
            Mini-packages of instructions, scripts, and references that extend agent capabilities.
          </p>
        </div>
        <button
          className="btn-reef-primary"
          style={{ padding: "8px 18px", fontSize: "13px" }}
          onClick={openCreate}
        >
          + Create Skill
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

      {/* Content */}
      {loading ? (
        <div className="reef-glass text-center" style={{ padding: "48px", color: colors.textMuted }}>
          Loading skills...
        </div>
      ) : tab === "Built-in" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {builtinSkills.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              onClick={() => setDetailSkill(s)}
              onClone={() => openClone(s)}
              colors={colors}
            />
          ))}
          {builtinSkills.length === 0 && (
            <div className="reef-glass text-center col-span-full" style={{ padding: "48px" }}>
              <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>No built-in skills</p>
              <p style={{ color: colors.textMuted, fontSize: 13 }}>Built-in skills are provided by the platform runtime.</p>
            </div>
          )}
        </div>
      ) : tab === "Custom" ? (
        <>
          {customSkills.length === 0 ? (
            <div className="reef-glass text-center" style={{ padding: "48px" }}>
              <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>No custom skills yet</p>
              <p style={{ color: colors.textMuted, fontSize: 13 }}>
                Create one, clone a built-in, or import from GitHub.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {customSkills.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  onClick={() => setDetailSkill(s)}
                  onEdit={() => openEdit(s)}
                  onDelete={() => handleDelete(s.id)}
                  colors={colors}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <ImportTab
          onImported={loadSkills}
          colors={colors}
        />
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <SkillModal
          initial={getInitialFormData()}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditingSkill(null);
            setCloneSource(null);
          }}
          colors={colors}
        />
      )}

      {/* Detail Panel */}
      {detailSkill && (
        <SkillDetailPanel
          skill={detailSkill}
          agents={agents}
          onClose={() => setDetailSkill(null)}
          onEdit={detailSkill.builtin ? undefined : () => openEdit(detailSkill)}
          onDelete={detailSkill.builtin ? undefined : () => handleDelete(detailSkill.id)}
          onClone={() => openClone(detailSkill)}
          onAssignAgent={handleAssignAgent}
          onUnassignAgent={handleUnassignAgent}
          colors={colors}
        />
      )}
    </div>
  );
}

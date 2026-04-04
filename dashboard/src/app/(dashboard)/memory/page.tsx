"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAgents,
  fetchMemories,
  fetchMemoryStatus,
  storeMemory,
  searchMemories,
  deleteMemory,
  type Agent,
  type MemoryEntry,
  type MemoryStatus,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/*  Category config                                                     */
/* ------------------------------------------------------------------ */

const CATEGORIES = ["all", "fact", "preference", "instruction", "observation"] as const;

const categoryStyle: Record<string, { color: string; bg: string; border: string }> = {
  fact: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.25)" },
  preference: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)" },
  instruction: { color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.25)" },
  observation: { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.25)" },
};

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function MemoryPage() {
  const { colors } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Memory system status
  const [status, setStatus] = useState<MemoryStatus | null>(null);

  // Add memory form
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("observation");

  // Load agents
  useEffect(() => {
    fetchAgents()
      .then((a) => {
        setAgents(a);
        if (a.length > 0) setSelectedAgent(a[0].name);
      })
      .catch(() => {});
  }, []);

  // Load memories when agent changes
  const loadMemories = useCallback(async () => {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const data = await fetchMemories(selectedAgent);
      setMemories(data);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  useEffect(() => {
    setSearchQuery("");
    setIsSearching(false);
    loadMemories();
    if (selectedAgent) {
      fetchMemoryStatus(selectedAgent).then(setStatus).catch(() => setStatus(null));
    }
  }, [loadMemories, selectedAgent]);

  // Search
  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedAgent) return;
    setIsSearching(true);
    setLoading(true);
    try {
      const results = await searchMemories(selectedAgent, searchQuery.trim());
      setMemories(results);
    } catch {
      // keep current
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
    loadMemories();
  };

  // Add memory
  const handleAdd = async () => {
    if (!newContent.trim() || !selectedAgent) return;
    try {
      await storeMemory(selectedAgent, newContent.trim(), newCategory);
      setNewContent("");
      setShowAdd(false);
      loadMemories();
    } catch {
      // handle error
    }
  };

  // Delete memory
  const handleDelete = async (id: string) => {
    if (!selectedAgent) return;
    try {
      await deleteMemory(selectedAgent, id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // handle error
    }
  };

  // Filter
  const filtered = filter === "all" ? memories : memories.filter((m) => m.category === filter);

  const stats = {
    total: memories.length,
    facts: memories.filter((m) => m.category === "fact").length,
    preferences: memories.filter((m) => m.category === "preference").length,
    instructions: memories.filter((m) => m.category === "instruction").length,
    observations: memories.filter((m) => m.category === "observation").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: colors.textPrimary, fontWeight: 800, fontSize: "22px" }}>Memory</h2>
          <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
            {status?.persistent
              ? "Persistent memory across sessions. Semantic search powered by pgvector."
              : "Ephemeral memory (current session only). Switch to pgvector for persistence."}
          </p>
        </div>
        <button
          className="btn-reef-primary"
          style={{ padding: "8px 18px", fontSize: "13px" }}
          onClick={() => setShowAdd(true)}
        >
          + Add Memory
        </button>
      </div>

      {/* Agent selector */}
      <div className="reef-glass" style={{ padding: "16px 20px" }}>
        <div className="flex items-center gap-4">
          <label className="text-sm" style={{ color: colors.badgeText, fontWeight: 600 }}>
            Agent
          </label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            style={{
              background: colors.inputBg,
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: 8,
              color: colors.textPrimary,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              minWidth: 200,
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              placeholder="Semantic search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{
                flex: 1,
                background: colors.inputBg,
                border: `1px solid ${colors.inputBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                padding: "6px 12px",
                fontSize: 13,
              }}
            />
            {isSearching ? (
              <button
                onClick={clearSearch}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#f87171",
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            ) : (
              <button
                onClick={handleSearch}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.accent,
                  background: colors.accentBg,
                  border: `1px solid ${colors.accentBorder}`,
                  cursor: "pointer",
                }}
              >
                Search
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: colors.textPrimary },
          { label: "Facts", value: stats.facts, color: categoryStyle.fact.color },
          { label: "Preferences", value: stats.preferences, color: categoryStyle.preference.color },
          { label: "Instructions", value: stats.instructions, color: categoryStyle.instruction.color },
          { label: "Observations", value: stats.observations, color: categoryStyle.observation.color },
        ].map((s) => (
          <div
            key={s.label}
            className="reef-glass text-center"
            style={{ padding: "12px" }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Memory system info */}
      {status && (
        <div
          className="reef-glass"
          style={{
            padding: "16px 20px",
            borderColor: status.persistent
              ? "rgba(34,197,94,0.2)"
              : "rgba(234,179,8,0.2)",
          }}
        >
          <div className="flex items-center gap-6 flex-wrap">
            {/* Scope */}
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: status.persistent ? "#22c55e" : "#eab308",
                  boxShadow: status.persistent
                    ? "0 0 8px rgba(34,197,94,0.5)"
                    : "0 0 8px rgba(234,179,8,0.5)",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
                {status.scope === "long-term" ? "Long-term" : "Short-term"}
              </span>
              <span style={{ fontSize: 12, color: colors.textMuted }}>
                {status.scope_label}
              </span>
            </div>

            <div style={{ width: 1, height: 20, background: colors.divider }} />

            {/* Backend */}
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.badgeText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Backend
              </span>
              <span
                style={{
                  fontSize: 12, fontWeight: 600, padding: "2px 10px",
                  borderRadius: 6,
                  color: status.persistent ? "#22d3ee" : "#eab308",
                  background: status.persistent ? "rgba(34,211,238,0.1)" : "rgba(234,179,8,0.1)",
                  border: `1px solid ${status.persistent ? "rgba(34,211,238,0.25)" : "rgba(234,179,8,0.25)"}`,
                }}
              >
                {status.backend_label}
              </span>
            </div>

            <div style={{ width: 1, height: 20, background: colors.divider }} />

            {/* Search type */}
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.badgeText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Search
              </span>
              <span style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 500 }}>
                {status.search_label}
              </span>
            </div>

            <div style={{ width: 1, height: 20, background: colors.divider }} />

            {/* Storage location */}
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.badgeText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Storage
              </span>
              <span style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 500 }}>
                {status.storage_location}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: "4px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
              color: filter === cat ? colors.textInverse : (cat === "all" ? colors.badgeText : (categoryStyle[cat]?.color ?? colors.badgeText)),
              background: filter === cat
                ? (cat === "all" ? colors.accent : (categoryStyle[cat]?.color ?? colors.accent))
                : (cat === "all" ? "rgba(148,163,184,0.1)" : (categoryStyle[cat]?.bg ?? "transparent")),
              border: `1px solid ${filter === cat ? "transparent" : (cat === "all" ? "rgba(148,163,184,0.2)" : (categoryStyle[cat]?.border ?? "transparent"))}`,
              transition: "all 0.2s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search indicator */}
      {isSearching && (
        <div
          className="reef-glass flex items-center gap-2"
          style={{ padding: "10px 16px", borderColor: colors.accentBorder }}
        >
          <span style={{ color: colors.accent, fontSize: 13, fontWeight: 600 }}>
            Semantic search results for &ldquo;{searchQuery}&rdquo;
          </span>
          <span style={{ color: colors.textMuted, fontSize: 12 }}>
            ({filtered.length} matches)
          </span>
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div className="reef-glass text-center" style={{ padding: "48px", color: colors.textMuted }}>
          Loading memories...
        </div>
      ) : filtered.length === 0 ? (
        <div className="reef-glass text-center" style={{ padding: "48px" }}>
          <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>
            {isSearching ? "No matching memories" : "No memories yet"}
          </p>
          <p style={{ color: colors.textMuted, fontSize: 13 }}>
            {isSearching
              ? "Try a different search query or clear the search."
              : "Memories are automatically extracted from conversations, or you can add them manually."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const style = categoryStyle[m.category] ?? categoryStyle.observation;
            return (
              <div
                key={m.id}
                className="reef-glass flex items-start gap-4 group"
                style={{ padding: "14px 18px" }}
              >
                {/* Category badge */}
                <span
                  className="text-xs rounded-md shrink-0 mt-0.5"
                  style={{
                    padding: "2px 8px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: style.color,
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                  }}
                >
                  {m.category}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p style={{ color: colors.textSecondary, fontSize: 13, fontWeight: 450, lineHeight: 1.5 }}>
                    {m.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {/* Scope badge */}
                    {status && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                        padding: "1px 6px", borderRadius: 4,
                        color: status.persistent ? "#22c55e" : "#eab308",
                        background: status.persistent ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                        border: `1px solid ${status.persistent ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)"}`,
                      }}>
                        {status.persistent ? "persistent" : "ephemeral"}
                      </span>
                    )}
                    {m.source && (
                      <span style={{ color: colors.textMuted, fontSize: 11 }}>
                        {m.source}
                      </span>
                    )}
                    {m.timestamp && (
                      <span style={{ color: colors.textMuted, fontSize: 11 }}>
                        {new Date(m.timestamp).toLocaleString()}
                      </span>
                    )}
                    {isSearching && (
                      <span style={{ color: colors.accent, fontSize: 11, fontWeight: 600 }}>
                        Score: {(m.relevance * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(m.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#f87171",
                    background: "rgba(248,113,113,0.1)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Memory Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: colors.overlayBg, backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <div
            className="reef-glass"
            style={{ width: 480, padding: "28px", borderColor: colors.accentBorder }}
          >
            <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              Add Memory
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>
                  Content
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="What should the agent remember?"
                  rows={3}
                  style={{
                    width: "100%",
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    borderRadius: 8,
                    color: colors.textPrimary,
                    padding: "8px 12px",
                    fontSize: 13,
                    resize: "vertical",
                  }}
                />
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: colors.badgeText, fontWeight: 600 }}>
                  Category
                </label>
                <div className="flex gap-2">
                  {(["fact", "preference", "instruction", "observation"] as const).map((cat) => {
                    const s = categoryStyle[cat];
                    return (
                      <button
                        key={cat}
                        onClick={() => setNewCategory(cat)}
                        style={{
                          padding: "4px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                          color: newCategory === cat ? colors.textInverse : s.color,
                          background: newCategory === cat ? s.color : s.bg,
                          border: `1px solid ${newCategory === cat ? "transparent" : s.border}`,
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.badgeText,
                    background: "transparent",
                    border: `1px solid ${colors.badgeBorder}`,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newContent.trim()}
                  className="btn-reef-primary"
                  style={{ padding: "8px 18px", fontSize: "13px", opacity: newContent.trim() ? 1 : 0.4 }}
                >
                  Store Memory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

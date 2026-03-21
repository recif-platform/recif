"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";

const commands = [
  { label: "Chat", path: "/chat", keywords: "chat conversation message" },
  { label: "Agents", path: "/agents", keywords: "list agents fleet overview grid" },
  { label: "Create Agent", path: "/agents/new", keywords: "create new wizard" },
  { label: "Tools", path: "/tools", keywords: "tools integrations http cli mcp builtin" },
  { label: "Create Tool", path: "/tools/new", keywords: "create new tool register" },
  { label: "Knowledge Base", path: "/knowledge", keywords: "knowledge base kb documents rag embedding" },
  { label: "Evaluations", path: "/evaluations", keywords: "eval test quality" },
  { label: "Settings", path: "/settings", keywords: "settings team config" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { colors, theme } = useTheme();

  const filtered = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.keywords.includes(query.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown") setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      if (e.key === "ArrowUp") setSelectedIndex((i) => Math.max(i - 1, 0));
      if (e.key === "Enter" && filtered[selectedIndex]) {
        router.push(filtered[selectedIndex].path);
        setOpen(false);
      }
    },
    [open, filtered, selectedIndex, router]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div
        className="fixed inset-0 backdrop-blur-sm"
        style={{ background: colors.overlayBg }}
        onClick={() => setOpen(false)}
      />
      <div
        className="reef-glass relative z-10 w-full max-w-lg"
        style={{
          boxShadow: theme === "dark"
            ? "0 16px 48px rgba(0,0,0,0.5), 0 0 40px rgba(6,182,212,0.08)"
            : "0 8px 32px rgba(0,0,0,0.12), 0 4px 16px rgba(14,116,144,0.06)",
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          placeholder="Search agents, pages, actions..."
          className="w-full px-5 py-4 bg-transparent outline-none"
          style={{ fontSize: "15px", color: colors.textPrimary, borderBottom: `1px solid ${colors.divider}` }}
        />
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.path}
              onClick={() => { router.push(cmd.path); setOpen(false); }}
              className="w-full text-left px-4 py-3 rounded-xl transition-colors"
              style={{
                fontSize: "14px",
                fontWeight: i === selectedIndex ? 600 : 400,
                color: i === selectedIndex ? colors.accent : colors.textSecondary,
                background: i === selectedIndex ? colors.accentBg : "transparent",
              }}
            >
              {cmd.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3" style={{ fontSize: "14px", color: colors.textMuted }}>No results</p>
          )}
        </div>
      </div>
    </div>
  );
}

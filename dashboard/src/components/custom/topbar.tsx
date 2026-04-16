"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "./notification-bell";
import { useTheme } from "@/lib/theme";
import { fetchCurrentUser, type CurrentUser } from "@/lib/api";
import { clearToken } from "@/lib/auth";

/** Map path segments to readable labels */
const segmentLabels: Record<string, string> = {
  chat: "Chat",
  agents: "Agents",
  tools: "Tools",
  knowledge: "Knowledge",
  evaluations: "Evaluations",
  settings: "Settings",
  eval: "Evaluation",
  config: "Config",
  versions: "Versions",
};

/** Context-aware labels -- "new" depends on parent */
const contextLabels: Record<string, Record<string, string>> = {
  agents: { new: "New Agent" },
  tools: { new: "New Tool" },
  knowledge: { new: "New Knowledge Base" },
};

function useBreadcrumbs(): string[] {
  const pathname = usePathname();
  if (!pathname) return [];

  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => {
    // Check context-aware labels first
    if (i > 0) {
      const parent = segments[i - 1];
      const contextLabel = contextLabels[parent]?.[seg];
      if (contextLabel) return contextLabel;
    }
    return segmentLabels[seg] ?? decodeURIComponent(seg);
  });
}

function SearchButton() {
  const { colors } = useTheme();
  return (
    <button
      className="btn-reef"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        fontSize: 12,
      }}
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
        );
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span style={{ color: colors.textMuted }}>Search</span>
      <kbd
        style={{
          fontSize: 10,
          padding: "1px 5px",
          borderRadius: 4,
          background: colors.accentBg,
          border: `1px solid ${colors.accentBorder}`,
          color: colors.textMuted,
          marginLeft: 2,
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme, colors } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      style={{
        background: "transparent",
        border: "none",
        color: colors.textMuted,
        cursor: "pointer",
        padding: 6,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = colors.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted; }}
    >
      {theme === "dark" ? (
        /* Sun icon */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        /* Moon icon */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        // If auth is disabled or request fails, leave user as null (show defaults)
      });
  }, []);

  return user;
}

function UserAvatar() {
  const { colors, theme } = useTheme();
  const user = useCurrentUser();

  const displayName = user?.name ?? "—";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
          cursor: "pointer",
        }}
        title="Sign out"
        data-testid="user-avatar"
        onClick={() => { clearToken(); window.location.href = "/login"; }}
      >
        {initial}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span data-testid="user-name" style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
            {displayName}
          </span>
          {user?.role && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 6,
                background: theme === "dark"
                  ? "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(12, 28, 50, 0.9))"
                  : colors.accentBg,
                border: `1px solid ${colors.accentBorder}`,
                color: colors.accent,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {user.role}
            </span>
          )}
        </div>
        {user?.email && (
          <span style={{ fontSize: 12, color: colors.textMuted }}>{user.email}</span>
        )}
      </div>
    </div>
  );
}

function ClusterStatus() {
  const { colors } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: colors.textMuted,
        paddingLeft: 12,
        borderLeft: `1px solid ${colors.navDivider}`,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 6px rgba(34, 197, 94, 0.4)",
          flexShrink: 0,
        }}
      />
      <span>Connected</span>
    </div>
  );
}

export function Topbar() {
  const crumbs = useBreadcrumbs();
  const { colors } = useTheme();

  return (
    <header
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: colors.topbarBg,
        backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${colors.topbarBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 10,
        flexShrink: 0,
        boxShadow: colors.topbarShadow,
      }}
    >
      {/* Left: Breadcrumb */}
      <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, letterSpacing: "-0.01em" }}>
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {i > 0 && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.textMuted}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            <span
              style={{
                color: i === crumbs.length - 1 ? colors.textPrimary : colors.textMuted,
                fontWeight: i === crumbs.length - 1 ? 600 : 500,
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
        {crumbs.length === 0 && (
          <span style={{ color: colors.textMuted, fontWeight: 500 }}>Dashboard</span>
        )}
      </nav>

      {/* Right: Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <SearchButton />
        <ThemeToggle />
        <NotificationBell />
        <div
          style={{
            width: 1,
            height: 20,
            background: colors.navDivider,
          }}
        />
        <UserAvatar />
        <ClusterStatus />
      </div>
    </header>
  );
}

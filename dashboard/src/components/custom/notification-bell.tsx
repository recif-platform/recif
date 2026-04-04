"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications, type Notification, type NotificationType } from "@/lib/notifications";
import { useTheme } from "@/lib/theme";

const TYPE_STYLES: Record<NotificationType, { color: string; icon: string }> = {
  success: { color: "#22c55e", icon: "✓" },
  info: { color: "#22d3ee", icon: "i" },
  warning: { color: "#f59e0b", icon: "!" },
  error: { color: "#ef4444", icon: "x" },
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotificationItem({ notif, onDismiss, onClick }: { notif: Notification; onDismiss: (id: string) => void; onClick: () => void }) {
  const style = TYPE_STYLES[notif.type];
  const { colors } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", gap: 10, padding: "12px 14px",
        borderBottom: `1px solid ${colors.divider}`,
        opacity: notif.read ? 0.6 : 1,
        transition: "all 0.2s",
        cursor: notif.conversationId ? "pointer" : "default",
        borderRadius: 8,
      }}
      onMouseEnter={(e) => { if (notif.conversationId) e.currentTarget.style.background = colors.accentBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* Type indicator */}
      <div style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        background: `${style.color}15`, color: style.color,
        boxShadow: `0 0 8px ${style.color}30`,
      }}>
        {style.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: notif.read ? 400 : 600, color: colors.textPrimary, lineHeight: 1.4 }}>
          {notif.title}
        </div>
        {notif.message && (
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 1.4 }}>
            {notif.message}
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
          {timeAgo(notif.timestamp)}
          {notif.source && <span> · {notif.source}</span>}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }}
        style={{
          background: "none", border: "none", color: colors.textMuted, cursor: "pointer",
          fontSize: 14, padding: 4, flexShrink: 0, lineHeight: 1,
        }}
        title="Dismiss"
      >
        x
      </button>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { colors, theme } = useTheme();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Mark as read when opening
  useEffect(() => {
    if (open && unreadCount > 0) {
      const t = setTimeout(() => markAllRead(), 2000);
      return () => clearTimeout(t);
    }
  }, [open, unreadCount, markAllRead]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent", border: "none", color: open ? colors.accent : colors.textMuted,
          cursor: "pointer", padding: 6, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "color 0.2s", position: "relative",
        }}
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 1, right: 1,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", color: "white",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 6px rgba(239,68,68,0.5)",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="reef-glass"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 360, maxHeight: 420,
            zIndex: 50,
            boxShadow: theme === "dark"
              ? "0 16px 48px rgba(0,0,0,0.5), 0 0 32px rgba(6,182,212,0.06)"
              : "0 8px 32px rgba(0,0,0,0.12), 0 4px 16px rgba(14,116,144,0.06)",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px",
            borderBottom: `1px solid ${colors.divider}`,
            position: "relative", zIndex: 1,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 500, color: colors.textMuted, marginLeft: 6 }}>
                  {unreadCount} new
                </span>
              )}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  background: "none", border: "none", fontSize: 11,
                  color: colors.textMuted, cursor: "pointer", fontWeight: 500,
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: colors.textMuted, fontSize: 13 }}>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notif={n} onDismiss={dismiss} onClick={() => {
                  if (n.conversationId) {
                    markRead(n.id);
                    setOpen(false);
                    localStorage.setItem("recif-chat-pending-cid", n.conversationId);
                    router.push("/chat");
                  }
                }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

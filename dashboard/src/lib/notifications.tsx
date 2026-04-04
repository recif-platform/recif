"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ─── Types ───

export type NotificationType = "success" | "info" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
  source?: string;
  /** Conversation ID if this is a chat notification */
  conversationId?: string;
}

/** Pending generation being watched */
interface PendingGeneration {
  agentSlug: string;
  agentName: string;
  conversationId: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  push: (type: NotificationType, title: string, message?: string, source?: string, conversationId?: string) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  /** Watch a conversation for completion. Notifies when done (unless user is viewing it). */
  watchGeneration: (agentSlug: string, agentName: string, conversationId: string) => void;
  /** The conversation ID the user is currently viewing (set by chat page). No notif for this one. */
  activeConversationId: string | null;
  setActiveConversationId: (cid: string | null) => void;
  /** Get partial content for a pending generation (used by chat page for live preview). */
  getPendingPartial: (cid: string) => { thinking: string; content: string } | null;
}

// ─── Context ───

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Hook ───

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

// ─── Parse thinking ───

function parseThinking(raw: string): { thinking: string; content: string } {
  const thinkingParts: string[] = [];
  let content = raw;
  const completedPattern = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = completedPattern.exec(raw)) !== null) {
    thinkingParts.push(match[1].trim());
  }
  content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const lastOpen = content.lastIndexOf("<think>");
  if (lastOpen !== -1 && !content.slice(lastOpen).includes("</think>")) {
    thinkingParts.push(content.slice(lastOpen + 7).trim());
    content = content.slice(0, lastOpen).trim();
  }
  return { thinking: thinkingParts.join("\n\n---\n\n"), content };
}

// ─── Provider ───

let idCounter = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const pendingRef = useRef<Map<string, PendingGeneration>>(new Map());
  const partialsRef = useRef<Map<string, { thinking: string; content: string }>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Force re-renders when partials update
  const [, setPartialTick] = useState(0);

  const push = useCallback((type: NotificationType, title: string, message?: string, source?: string, conversationId?: string): string => {
    const id = `notif_${Date.now()}_${++idCounter}`;
    const notif: Notification = { id, type, title, message, timestamp: Date.now(), read: false, source, conversationId };
    setNotifications((prev) => [notif, ...prev]);
    return id;
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const watchGeneration = useCallback((agentSlug: string, agentName: string, conversationId: string) => {
    pendingRef.current.set(conversationId, { agentSlug, agentName, conversationId });
  }, []);

  const getPendingPartial = useCallback((cid: string) => {
    return partialsRef.current.get(cid) || null;
  }, []);

  // Global polling loop — watches all pending generations
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      const pending = pendingRef.current;
      if (pending.size === 0) return;

      for (const [cid, gen] of pending.entries()) {
        try {
          const res = await fetch(`${API_URL}/api/v1/agents/${gen.agentSlug}/conversations/${cid}/status`);
          if (!res.ok) continue;
          const status = await res.json();

          if (status.generating && status.partial) {
            // Update partial for live preview
            partialsRef.current.set(cid, parseThinking(status.partial));
            setPartialTick((t) => t + 1);
          } else if (!status.generating) {
            // Done — remove from pending
            pending.delete(cid);
            partialsRef.current.delete(cid);
            // Only notify if user is NOT viewing this conversation
            if (activeConversationId !== cid) {
              push("success", "Response ready", `${gen.agentName} finished responding`, "chat", cid);
            }
          }
        } catch { /* retry */ }
      }
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeConversationId, push]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount,
      push, markRead, markAllRead, dismiss, clearAll,
      watchGeneration, activeConversationId, setActiveConversationId,
      getPendingPartial,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

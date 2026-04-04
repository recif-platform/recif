"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Agent, fetchAgents } from "@/lib/api";
import { ReefMarkdown } from "@/components/custom/reef-markdown";
import { useNotifications } from "@/lib/notifications";
import { useTheme } from "@/lib/theme";
import { AgentBlockRenderer } from "@/components/agui";
import type { AgentBlock } from "@/components/agui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  thinking?: string;
  blocks?: AgentBlock[];
}

/** Parse ALL <think>...</think> blocks and clean XML tool tags from raw LLM output */
function parseThinking(raw: string): { thinking: string; content: string } {
  const thinkingParts: string[] = [];
  let content = raw;

  // Extract all completed <think>...</think> blocks
  const completedPattern = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = completedPattern.exec(raw)) !== null) {
    thinkingParts.push(match[1].trim());
  }
  // Remove all completed think blocks from content
  content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Check for an unclosed <think> at the end (still streaming)
  const lastOpen = content.lastIndexOf("<think>");
  if (lastOpen !== -1 && !content.slice(lastOpen).includes("</think>")) {
    thinkingParts.push(content.slice(lastOpen + 7).trim());
    content = content.slice(0, lastOpen).trim();
  }

  // Strip completed XML tool tags from displayed content (stored for LLM context, not for display)
  // Only strip complete tags — during streaming the closing tag might not exist yet
  content = content.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, "").trim();
  content = content.replace(/<tool_result>[\s\S]*?<\/tool_result>/g, "").trim();
  // Strip unclosed <tool_use> at the end (streaming in progress)
  const unclosedToolUse = content.lastIndexOf("<tool_use>");
  if (unclosedToolUse !== -1 && !content.slice(unclosedToolUse).includes("</tool_use>")) {
    content = content.slice(0, unclosedToolUse).trim();
  }

  return {
    thinking: thinkingParts.join("\n\n---\n\n"),
    content,
  };
}

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  // Start expanded if streaming OR if thinking just arrived (fast models)
  const [expanded, setExpanded] = useState(true);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const { colors } = useTheme();

  // Auto-collapse after streaming ends + a brief delay so user can see the thinking
  useEffect(() => {
    if (!isStreaming && thinking) {
      const t = setTimeout(() => setExpanded(false), 1500);
      return () => clearTimeout(t);
    }
  }, [isStreaming, thinking]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && expanded && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, isStreaming, expanded]);

  if (!thinking) return null;

  return (
    <div style={{ marginBottom: expanded ? 12 : 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: colors.textMuted, fontSize: 12, fontWeight: 500,
          padding: 0, transition: "color 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.textSecondary; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted; }}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {isStreaming ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="reef-dots" style={{ transform: "scale(0.7)" }}><span /><span /><span /></span>
            Thinking...
          </span>
        ) : (
          <span>Thought for a moment</span>
        )}
      </button>
      {expanded && (
        <div
          ref={thinkingRef}
          style={{
            marginTop: 8, padding: "10px 14px",
            borderLeft: `2px solid ${colors.accentBorder}`,
            background: colors.accentBg,
            borderRadius: "0 8px 8px 0",
            fontSize: 13, lineHeight: 1.6,
            color: colors.textMuted, fontStyle: "italic",
            maxHeight: 200, overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {thinking}
          {isStreaming && <span className="reef-cursor" style={{ height: 14 }} />}
        </div>
      )}
    </div>
  );
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
}

function SuggestionChips({ suggestions, onSelect, visible }: {
  suggestions: string[];
  onSelect: (text: string) => void;
  visible: boolean;
}) {
  const { colors, theme } = useTheme();

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 24px 4px",
        animation: "reefChipsFadeIn 0.3s ease-out",
      }}
    >
      {suggestions.map((text, i) => (
        <button
          key={i}
          onClick={() => onSelect(text)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            cursor: "pointer",
            transition: "all 0.2s ease",
            background: theme === "dark"
              ? "rgba(10, 24, 45, 0.7)"
              : "rgba(255, 255, 255, 0.8)",
            border: `1px solid ${colors.accentBorder}`,
            color: colors.textSecondary,
            boxShadow: theme === "dark"
              ? "inset 0 1px 0 rgba(34,211,238,0.06), 0 2px 8px rgba(0,0,0,0.15)"
              : "0 1px 3px rgba(0,0,0,0.06)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.accent;
            e.currentTarget.style.color = colors.accent;
            e.currentTarget.style.boxShadow = theme === "dark"
              ? `inset 0 1px 0 rgba(34,211,238,0.1), 0 2px 12px rgba(6,182,212,0.2), 0 0 20px ${colors.accentGlow}`
              : `0 2px 8px rgba(8,145,178,0.15)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.accentBorder;
            e.currentTarget.style.color = colors.textSecondary;
            e.currentTarget.style.boxShadow = theme === "dark"
              ? "inset 0 1px 0 rgba(34,211,238,0.06), 0 2px 8px rgba(0,0,0,0.15)"
              : "0 1px 3px rgba(0,0,0,0.06)";
          }}
        >
          {text}
        </button>
      ))}
      <style>{`
        @keyframes reefChipsFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function ChatPage() {
  const { colors, theme } = useTheme();
  const { push: pushNotification, watchGeneration, setActiveConversationId, getPendingPartial } = useNotifications();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeKBs, setActiveKBs] = useState<Set<string>>(new Set());
  const [kbNames, setKbNames] = useState<Record<string, string>>({});
  const [copiedCid, setCopiedCid] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareMessages, setCompareMessages] = useState<{stable: ChatMessage[], canary: ChatMessage[]}>({stable: [], canary: []});
  const [compareSending, setCompareSending] = useState<{stable: boolean, canary: boolean}>({stable: false, canary: false});
  const [compareLatency, setCompareLatency] = useState<{stable: number | null, canary: number | null}>({stable: null, canary: null});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingCidRef = useRef<string | null>(null);
  const compareAbortRef = useRef<{stable: AbortController | null, canary: AbortController | null}>({stable: null, canary: null});

  const getSlug = useCallback(() => {
    return selectedAgent?.slug || selectedAgent?.name?.toLowerCase().replace(/\s+/g, "-") || "";
  }, [selectedAgent]);

  useEffect(() => {
    fetchAgents()
      .then((data) => {
        setAgents(data);
        const lastSlug = typeof window !== "undefined" ? localStorage.getItem("recif-chat-agent") : null;
        const match = data.find((a) => a.slug === lastSlug || a.name.toLowerCase().replace(/\s+/g, "-") === lastSlug);
        if (match) {
          setSelectedAgent(match);
          setActiveKBs(new Set(match.knowledgeBases || match.knowledge_bases || []));
        } else if (data.length > 0) {
          setSelectedAgent(data[0]);
          setActiveKBs(new Set(data[0].knowledgeBases || data[0].knowledge_bases || []));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch KB names for display
    fetch(`${API_URL}/api/v1/knowledge-bases`)
      .then((r) => r.json())
      .then((d) => {
        const names: Record<string, string> = {};
        for (const kb of d.data || []) names[kb.id] = kb.name;
        setKbNames(names);
      })
      .catch(() => {});
  }, []);

  // Handle deep-link from notification click
  useEffect(() => {
    if (!selectedAgent) return;
    const pendingCid = localStorage.getItem("recif-chat-pending-cid");
    if (pendingCid) {
      localStorage.removeItem("recif-chat-pending-cid");
      loadConversation(pendingCid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  const fetchConversations = useCallback(async () => {
    if (!selectedAgent) return;
    try {
      const slug = selectedAgent.slug || selectedAgent.name.toLowerCase().replace(/\s+/g, "-");
      const res = await fetch(`${API_URL}/api/v1/agents/${slug}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {}
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedAgent) {
      fetchConversations();
      localStorage.setItem("recif-chat-agent", selectedAgent.slug || selectedAgent.name.toLowerCase().replace(/\s+/g, "-"));
    }
  }, [selectedAgent, fetchConversations]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track active conversation so notifications skip it
  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId, setActiveConversationId]);

  // Fetch static suggestions when agent selected and no conversation loaded
  const fetchStaticSuggestions = useCallback(async (agent: Agent) => {
    try {
      const slug = agent.slug || agent.name.toLowerCase().replace(/\s+/g, "-");
      const res = await fetch(`${API_URL}/api/v1/agents/${slug}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
          setSuggestionsVisible(true);
        }
      }
    } catch { /* graceful degradation — no suggestions */ }
  }, []);

  // Load static suggestions on initial agent selection
  useEffect(() => {
    if (selectedAgent && messages.length === 0 && !conversationId) {
      fetchStaticSuggestions(selectedAgent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  const selectAgent = (agent: Agent) => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    stopPolling();
    setSending(false); streamingCidRef.current = null;
    setSelectedAgent(agent); setConversationId(null); setMessages([]);
    setSuggestions([]); setSuggestionsVisible(true);
    // Enable all assigned KBs by default
    setActiveKBs(new Set(agent.knowledgeBases || agent.knowledge_bases || []));
    // Fetch static suggestions for empty chat state
    fetchStaticSuggestions(agent);
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const parseMessages = (raw: { role: string; content: string }[]): ChatMessage[] =>
    raw.map((m) => {
      if (m.role !== "user" && m.content.includes("<think>")) {
        const parsed = parseThinking(m.content);
        return { role: "agent" as const, content: parsed.content, thinking: parsed.thinking };
      }
      return { role: m.role === "user" ? "user" as const : "agent" as const, content: m.content };
    });

  const loadConversation = async (cid: string) => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    stopPolling();
    setSending(false); streamingCidRef.current = null;
    setConversationId(cid);
    setSuggestions([]); setSuggestionsVisible(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/conversations/${cid}`);
      if (res.ok) {
        const data = await res.json();
        const loaded = parseMessages(data.messages || []);
        setMessages(loaded);

        // If last message is user (response still generating), poll directly for live content
        if (loaded.length > 0 && loaded[loaded.length - 1].role === "user") {
          setSending(true);
          setMessages((prev) => [...prev, { role: "agent", content: "" }]);
          const slug = getSlug();
          // Register for global notifications (fires if user navigates away)
          watchGeneration(slug, selectedAgent?.name || "Agent", cid);
          // Direct poll for live display
          pollRef.current = setInterval(async () => {
            try {
              const statusRes = await fetch(`${API_URL}/api/v1/agents/${slug}/conversations/${cid}/status`);
              if (!statusRes.ok) return;
              const status = await statusRes.json();

              if (status.generating && status.partial) {
                const parsed = parseThinking(status.partial);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "agent") {
                    updated[updated.length - 1] = { ...last, content: parsed.content, thinking: parsed.thinking };
                  }
                  return updated;
                });
              } else if (!status.generating) {
                // Done — load final response from storage
                stopPolling();
                const r = await fetch(`${API_URL}/api/v1/agents/${slug}/conversations/${cid}`);
                if (r.ok) {
                  const d = await r.json();
                  setMessages(parseMessages(d.messages || []));
                }
                setSending(false);
                fetchConversations();
              }
            } catch { /* retry */ }
          }, 1000);
        }
      } else setMessages([]);
    } catch { setMessages([]); }
  };

  // Cleanup polling on unmount or conversation change
  useEffect(() => stopPolling, []);

  const deleteConversation = async (cid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/api/v1/agents/${getSlug()}/conversations/${cid}`, { method: "DELETE" });
      if (conversationId === cid) { setConversationId(null); setMessages([]); }
      fetchConversations();
    } catch { /* best effort */ }
  };

  const copyConversation = async (cid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/conversations/${cid}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      const agentName = selectedAgent?.name || "Agent";
      const md = msgs.map((m: { role: string; content: string }) => {
        const label = m.role === "user" ? "**You**" : `**${agentName}**`;
        // Strip think/tool XML tags for clean output
        let content = m.content
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/<tool_use>[\s\S]*?<\/tool_use>/g, "")
          .replace(/<tool_result>[\s\S]*?<\/tool_result>/g, "")
          .trim();
        return `${label}\n\n${content}`;
      }).join("\n\n---\n\n");
      await navigator.clipboard.writeText(md);
      setCopiedCid(cid);
      setTimeout(() => setCopiedCid(null), 2000);
    } catch { /* best effort */ }
  };

  const newChat = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    stopPolling();
    setSending(false); streamingCidRef.current = null;
    setConversationId(null); setMessages([]);
    setSuggestions([]); setSuggestionsVisible(true);
    if (selectedAgent) fetchStaticSuggestions(selectedAgent);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending || !selectedAgent) return;
    const userMsg = input.trim();
    setInput("");
    setSuggestions([]); setSuggestionsVisible(true);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    const activeCid = conversationId;
    streamingCidRef.current = activeCid;
    setMessages((prev) => [...prev, { role: "agent", content: "" }]);
    const controller = new AbortController();
    abortRef.current = controller;

    // Register watch immediately for existing conversations
    if (activeCid) {
      watchGeneration(getSlug(), selectedAgent?.name || "Agent", activeCid);
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userMsg,
          conversation_id: conversationId,
          options: { use_rag: activeKBs.size > 0, active_kbs: Array.from(activeKBs) },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        let rawAccum = "";
        let watchRegistered = !!activeCid;
        const streamBlocks: AgentBlock[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.token && streamingCidRef.current === activeCid) {
                  rawAccum += data.token;
                  const parsed = parseThinking(rawAccum);
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "agent") {
                      updated[updated.length - 1] = { ...last, content: parsed.content, thinking: parsed.thinking, blocks: streamBlocks.length > 0 ? [...streamBlocks] : undefined };
                    }
                    return updated;
                  });
                }

                // AG-UI: structured component block
                if (data.component && streamingCidRef.current === activeCid) {
                  // Flush any pending text into a text block
                  if (rawAccum.trim()) {
                    const parsed = parseThinking(rawAccum);
                    streamBlocks.push({ type: "text", content: parsed.content });
                    rawAccum = "";
                  }
                  streamBlocks.push({ type: "component", component: data.component, props: data.props ?? {} });
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "agent") {
                      updated[updated.length - 1] = { ...last, blocks: [...streamBlocks] };
                    }
                    return updated;
                  });
                }

                // AG-UI: confirm action block
                if (data.confirm && streamingCidRef.current === activeCid) {
                  if (rawAccum.trim()) {
                    const parsed = parseThinking(rawAccum);
                    streamBlocks.push({ type: "text", content: parsed.content });
                    rawAccum = "";
                  }
                  streamBlocks.push({ type: "confirm", confirm: data.confirm });
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "agent") {
                      updated[updated.length - 1] = { ...last, blocks: [...streamBlocks] };
                    }
                    return updated;
                  });
                }

                if (data.conversation_id) {
                  if (streamingCidRef.current === activeCid) {
                    setConversationId(data.conversation_id);
                  }
                  // Register watch for new conversations (first time we get the cid)
                  if (!watchRegistered) {
                    watchGeneration(getSlug(), selectedAgent?.name || "Agent", data.conversation_id);
                    watchRegistered = true;
                  }
                }

                // Done event — unlock input immediately (suggestions may still arrive)
                if (data.done && streamingCidRef.current === activeCid) {
                  setSending(false);
                }

                // Suggestion chips from agent (arrive after done)
                if (data.suggestions && Array.isArray(data.suggestions)) {
                  console.log("[recif] suggestions received:", data.suggestions);
                  setSuggestions(data.suggestions);
                  setSuggestionsVisible(true);
                }
              } catch {}
            }
          }
        }
        // Finalize: flush any remaining text as a block
        if (streamBlocks.length > 0 && rawAccum.trim()) {
          const parsed = parseThinking(rawAccum);
          streamBlocks.push({ type: "text", content: parsed.content });
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "agent") {
              updated[updated.length - 1] = { ...last, content: parsed.content, blocks: [...streamBlocks] };
            }
            return updated;
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (streamingCidRef.current === activeCid) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "agent" && last.content === "") updated[updated.length - 1] = { ...last, content: "Error: Could not reach the agent." };
          return updated;
        });
      }
    } finally {
      if (streamingCidRef.current === activeCid) { setSending(false); streamingCidRef.current = null; }
      abortRef.current = null;
      fetchConversations();
    }
  };

  const streamCompareVariant = async (
    variant: "stable" | "canary",
    userMsg: string,
    controller: AbortController,
  ) => {
    const slug = getSlug();
    const versionParam = variant === "canary" ? "?version=canary" : "";
    const startTime = Date.now();
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${slug}/chat/stream${versionParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userMsg,
          options: { use_rag: activeKBs.size > 0, active_kbs: Array.from(activeKBs) },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        let rawAccum = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.token) {
                  rawAccum += data.token;
                  const parsed = parseThinking(rawAccum);
                  setCompareMessages((prev) => {
                    const updated = [...prev[variant]];
                    const last = updated[updated.length - 1];
                    if (last?.role === "agent") {
                      updated[updated.length - 1] = { ...last, content: parsed.content, thinking: parsed.thinking };
                    }
                    return { ...prev, [variant]: updated };
                  });
                }
              } catch {}
            }
          }
        }
      }
      setCompareLatency((prev) => ({ ...prev, [variant]: Date.now() - startTime }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCompareMessages((prev) => {
        const updated = [...prev[variant]];
        const last = updated[updated.length - 1];
        if (last?.role === "agent" && last.content === "") {
          updated[updated.length - 1] = { ...last, content: "Error: Could not reach the agent." };
        }
        return { ...prev, [variant]: updated };
      });
    } finally {
      setCompareSending((prev) => ({ ...prev, [variant]: false }));
    }
  };

  const sendCompareMessage = async () => {
    if (!input.trim() || !selectedAgent) return;
    if (compareSending.stable || compareSending.canary) return;
    const userMsg = input.trim();
    setInput("");
    const userMessage: ChatMessage = { role: "user", content: userMsg };
    const emptyAgent: ChatMessage = { role: "agent", content: "" };
    setCompareMessages((prev) => ({
      stable: [...prev.stable, userMessage, emptyAgent],
      canary: [...prev.canary, userMessage, emptyAgent],
    }));
    setCompareSending({ stable: true, canary: true });
    setCompareLatency({ stable: null, canary: null });

    const stableController = new AbortController();
    const canaryController = new AbortController();
    compareAbortRef.current = { stable: stableController, canary: canaryController };

    streamCompareVariant("stable", userMsg, stableController);
    streamCompareVariant("canary", userMsg, canaryController);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />
        <div className="h-96 rounded-2xl animate-pulse" style={{ background: colors.badgeBg }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 style={{ color: colors.textPrimary }}>Chat</h2>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3.5">
          {/* Agent picker */}
          <div className="reef-glass" style={{ padding: "20px" }}>
            <label className="block uppercase tracking-wider mb-2.5" style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>Agent</label>
            <select
              value={selectedAgent?.id || ""}
              onChange={(e) => { const a = agents.find((a) => a.id === e.target.value); if (a) selectAgent(a); }}
              className="w-full rounded-xl text-sm outline-none cursor-pointer"
              style={{
                padding: "12px 16px",
                background: colors.inputBg,
                border: `1px solid ${colors.inputBorder}`,
                color: colors.textPrimary,
                boxShadow: theme === "dark" ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              {agents.length === 0 && <option value="">No agents available</option>}
              {agents.map((a) => <option key={a.id} value={a.id} style={{ background: theme === "dark" ? "#0c1c32" : "#ffffff" }}>{a.name}</option>)}
            </select>
            {selectedAgent && (
              <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: colors.textMuted }}>
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
                Running · {selectedAgent.framework}
                <button
                  onClick={() => {
                    setCompareMode((v) => !v);
                    if (!compareMode) {
                      setCompareMessages({ stable: [], canary: [] });
                      setCompareSending({ stable: false, canary: false });
                      setCompareLatency({ stable: null, canary: null });
                    }
                  }}
                  style={{
                    marginLeft: "auto",
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: compareMode ? "rgba(234,179,8,0.15)" : colors.badgeBg,
                    border: compareMode ? "1px solid rgba(234,179,8,0.35)" : `1px solid ${colors.badgeBorder}`,
                    color: compareMode ? "#eab308" : colors.textMuted,
                    cursor: "pointer", transition: "all 0.15s",
                    letterSpacing: "0.03em",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22" />
                    <rect x="2" y="6" width="8" height="12" rx="1" />
                    <rect x="14" y="6" width="8" height="12" rx="1" />
                  </svg>
                  A/B Test
                </button>
              </div>
            )}
          </div>

          {/* Conversations */}
          <div className="reef-glass flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-[18px] py-4" style={{ borderBottom: `1px solid ${colors.divider}` }}>
              <span className="uppercase" style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>Conversations</span>
              <button onClick={newChat} className="btn-reef">+ New</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="p-4 text-sm text-center" style={{ color: colors.textMuted }}>{selectedAgent ? "No conversations yet" : "Select an agent"}</div>
              ) : conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className="group w-full text-left rounded-xl transition-all mb-0.5 conv-item-hover cursor-pointer relative"
                  style={{
                    padding: "14px",
                    paddingRight: "32px",
                    background: conversationId === c.id ? colors.accentBg : "transparent",
                    border: conversationId === c.id ? `1px solid ${colors.accentBorder}` : "1px solid transparent",
                    boxShadow: conversationId === c.id ? (theme === "dark" ? "inset 0 0 16px rgba(6,182,212,0.03), 0 2px 8px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.04)") : "none",
                  }}
                >
                  <div className="truncate" style={{
                    color: conversationId === c.id ? colors.textPrimary : colors.textSecondary,
                    fontSize: "13px",
                    fontWeight: conversationId === c.id ? 600 : 400,
                  }}>
                    {c.title || `Conversation ${c.id.slice(0, 8)}`}
                  </div>
                  <div className="flex items-center gap-2.5 mt-1.5" style={{ color: colors.textMuted, fontSize: "12px", fontWeight: 400 }}>
                    <span>{c.message_count} msg{c.message_count !== 1 ? "s" : ""}</span>
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  {/* Action buttons — visible on hover */}
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => copyConversation(c.id, e)}
                      style={{
                        background: "none", border: "none",
                        color: copiedCid === c.id ? "#22d3ee" : "#475569",
                        cursor: "pointer", fontSize: 13, padding: 4, lineHeight: 1,
                        borderRadius: 6,
                      }}
                      onMouseEnter={(e) => { if (copiedCid !== c.id) e.currentTarget.style.color = "#94a3b8"; }}
                      onMouseLeave={(e) => { if (copiedCid !== c.id) e.currentTarget.style.color = "#475569"; }}
                      title="Copy as Markdown"
                    >
                      {copiedCid === c.id ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      )}
                    </button>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      style={{
                        background: "none", border: "none", color: "#475569",
                        cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1,
                        borderRadius: 6,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
                      title="Delete conversation"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div
          className="reef-glass flex-1 flex flex-col min-h-0"
        >
          {compareMode ? (
            <>
              {/* Compare mode: two columns */}
              <div className="flex-1 flex min-h-0">
                {(["stable", "canary"] as const).map((variant) => {
                  const variantMessages = compareMessages[variant];
                  const isSending = compareSending[variant];
                  const latency = compareLatency[variant];
                  const accentColor = variant === "stable" ? "#22c55e" : "#eab308";
                  const accentBg = variant === "stable" ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)";
                  const accentBorder = variant === "stable" ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)";
                  const label = variant === "stable" ? "Version A" : "Version B";

                  return (
                    <div
                      key={variant}
                      className="flex-1 flex flex-col min-h-0"
                      style={{
                        borderRight: variant === "stable" ? `1px solid ${colors.divider}` : undefined,
                      }}
                    >
                      {/* Column header */}
                      <div
                        className="flex items-center gap-2 px-4 py-2.5"
                        style={{
                          borderBottom: `1px solid ${accentBorder}`,
                          background: accentBg,
                        }}
                      >
                        <span
                          style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: accentColor,
                            boxShadow: `0 0 8px ${accentColor}60`,
                          }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: accentColor, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                          {label}
                        </span>
                        {latency !== null && (
                          <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: "auto" }}>
                            {latency}ms
                          </span>
                        )}
                      </div>
                      {/* Column messages */}
                      <div className="flex-1 overflow-y-auto" style={{ padding: "20px" }}>
                        <div className="flex flex-col gap-4">
                          {variantMessages.length === 0 ? (
                            <div className="text-sm text-center py-8" style={{ color: colors.textMuted }}>
                              Send a message to compare both versions
                            </div>
                          ) : variantMessages.map((m, i) => (
                            <div
                              key={i}
                              className="rounded-2xl"
                              style={{
                                maxWidth: m.role === "user" ? "85%" : "100%",
                                padding: "12px 16px",
                                fontSize: "14px",
                                lineHeight: "1.7",
                                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                                borderBottomRightRadius: m.role === "user" ? "6px" : undefined,
                                borderBottomLeftRadius: m.role === "agent" ? "6px" : undefined,
                                ...(m.role === "user" ? {
                                  background: colors.userBubbleBg,
                                  color: colors.userBubbleText,
                                  boxShadow: colors.userBubbleShadow,
                                } : {
                                  background: colors.agentBubbleBg,
                                  border: `1px solid ${colors.agentBubbleBorder}`,
                                  color: colors.agentBubbleText,
                                  boxShadow: colors.agentBubbleShadow,
                                }),
                              }}
                            >
                              <div
                                className="uppercase mb-1.5"
                                style={{
                                  color: m.role === "user" ? "rgba(255,255,255,0.5)" : accentColor,
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  letterSpacing: "0.06em",
                                }}
                              >
                                {m.role === "user" ? "You" : `${selectedAgent?.name} (${label})`}
                              </div>
                              {m.role === "agent" ? (() => {
                                const thinking = m.thinking || (m.content.includes("<think>") ? parseThinking(m.content).thinking : "");
                                const content = m.thinking != null ? m.content : (m.content.includes("<think>") ? parseThinking(m.content).content : m.content);
                                const isLast = isSending && i === variantMessages.length - 1;

                                return (
                                  <>
                                    {thinking && (
                                      <ThinkingBlock thinking={thinking} isStreaming={isLast && !content} />
                                    )}
                                    {content ? (
                                      <>
                                        <ReefMarkdown content={content} />
                                        {isLast && <span className="reef-cursor" />}
                                      </>
                                    ) : isLast ? (
                                      <div className="flex items-center gap-2">
                                        <div className="reef-dots"><span /><span /><span /></div>
                                        <span style={{ color: colors.textMuted, fontSize: 13 }}>
                                          {thinking ? "Executing tool..." : "Generating response..."}
                                        </span>
                                      </div>
                                    ) : null}
                                  </>
                                );
                              })() : m.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Compare mode input */}
              <div className="relative z-[1]" style={{ padding: "12px 24px 18px", borderTop: `1px solid ${colors.divider}` }}>
                <div
                  className="flex gap-3 items-center rounded-[14px] transition-all"
                  style={{
                    padding: "8px 8px 8px 20px",
                    background: theme === "dark" ? "linear-gradient(165deg, rgba(20,38,62,0.8), rgba(14,30,52,0.85))" : colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    boxShadow: theme === "dark" ? "inset 0 1px 0 rgba(34,211,238,0.06), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendCompareMessage()}
                    placeholder={selectedAgent ? `A/B Test: send to both versions...` : "Select an agent first"}
                    disabled={(compareSending.stable || compareSending.canary) || !selectedAgent}
                    className="flex-1 bg-transparent border-none outline-none text-[15px]"
                    style={{ color: colors.textPrimary }}
                  />
                  <button
                    onClick={sendCompareMessage}
                    disabled={(compareSending.stable || compareSending.canary) || !input.trim() || !selectedAgent}
                    className="btn-reef-primary"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Normal single-column chat */}
              {/* Messages */}
              <div className="flex-1 overflow-y-auto relative z-[1]" style={{ padding: "32px" }}>
                <div className="flex flex-col gap-5">
                  {!selectedAgent ? (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: colors.textMuted }}>Select an agent to start chatting</div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: colors.textMuted }}>Send a message to start chatting with {selectedAgent.name}</div>
                  ) : messages.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-2xl"
                      style={{
                        maxWidth: m.role === "user" ? "70%" : "100%",
                        padding: "16px 20px",
                        fontSize: "16px",
                        lineHeight: "1.7",
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        borderBottomRightRadius: m.role === "user" ? "6px" : undefined,
                        borderBottomLeftRadius: m.role === "agent" ? "6px" : undefined,
                        ...(m.role === "user" ? {
                          background: colors.userBubbleBg,
                          color: colors.userBubbleText,
                          boxShadow: colors.userBubbleShadow,
                        } : {
                          background: colors.agentBubbleBg,
                          border: `1px solid ${colors.agentBubbleBorder}`,
                          color: colors.agentBubbleText,
                          boxShadow: colors.agentBubbleShadow,
                        }),
                      }}
                    >
                      <div
                        className="uppercase mb-2"
                        style={{
                          color: m.role === "user" ? "rgba(255,255,255,0.5)" : colors.agentLabel,
                          fontSize: "11px",
                          fontWeight: m.role === "user" ? 500 : 700,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {m.role === "user" ? "You" : selectedAgent?.name}
                      </div>
                      {m.role === "agent" ? (() => {
                        // Safety: re-parse if content still has <think> tags
                        const thinking = m.thinking || (m.content.includes("<think>") ? parseThinking(m.content).thinking : "");
                        let content = m.thinking != null ? m.content : (m.content.includes("<think>") ? parseThinking(m.content).content : m.content);
                        const isLast = sending && i === messages.length - 1;

                        // Extract sources from "*Sources: file1, file2*\n\n" prefix
                        let sources: string[] = [];
                        const sourcesMatch = content.match(/^\*Sources:\s*(.+?)\*\s*/);
                        if (sourcesMatch) {
                          sources = sourcesMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
                          content = content.slice(sourcesMatch[0].length).trim();
                        }

                        // Confirm/cancel handlers for HITL blocks
                        const handleConfirm = (confirmId: string) => {
                          fetch(`${API_URL}/api/v1/agents/${getSlug()}/confirm`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: confirmId, action: "confirm", conversation_id: conversationId }),
                          }).catch(() => {});
                        };
                        const handleCancel = (confirmId: string) => {
                          fetch(`${API_URL}/api/v1/agents/${getSlug()}/confirm`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: confirmId, action: "cancel", conversation_id: conversationId }),
                          }).catch(() => {});
                        };

                        return (
                          <>
                            {thinking && (
                              <ThinkingBlock thinking={thinking} isStreaming={isLast && !content} />
                            )}
                            {sources.length > 0 && (
                              <div className="rag-sources">
                                <span className="rag-sources-label">Sources</span>
                                {sources.map((src, si) => (
                                  <span key={si} className="rag-source-badge">{src}</span>
                                ))}
                              </div>
                            )}
                            {/* AG-UI block rendering when structured blocks are present */}
                            {m.blocks && m.blocks.length > 0 ? (
                              <div className="flex flex-col gap-3">
                                {m.blocks.map((block, bi) => (
                                  <AgentBlockRenderer
                                    key={bi}
                                    block={block}
                                    onConfirm={handleConfirm}
                                    onCancel={handleCancel}
                                    isStreaming={isLast && bi === m.blocks!.length - 1}
                                  />
                                ))}
                                {isLast && <span className="reef-cursor" />}
                              </div>
                            ) : content ? (
                              <>
                                <ReefMarkdown content={content} />
                                {isLast && <span className="reef-cursor" />}
                              </>
                            ) : isLast ? (
                              thinking ? null : (
                                <div className="flex items-center gap-2">
                                  <div className="reef-dots"><span /><span /><span /></div>
                                  <span style={{ color: colors.textMuted, fontSize: 14 }}>
                                    Generating response...
                                  </span>
                                </div>
                              )
                            ) : null}
                          </>
                        );
                      })() : m.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* Suggestion chips */}
              <SuggestionChips
                suggestions={suggestions}
                visible={suggestionsVisible && !sending}
                onSelect={(text) => {
                  setInput(text);
                  setSuggestionsVisible(false);
                }}
              />

              {/* KB toggles + Input */}
              <div className="relative z-[1]" style={{ padding: "12px 24px 18px", borderTop: `1px solid ${colors.divider}` }}>
                {/* Per-KB toggles */}
                {(selectedAgent?.knowledgeBases || selectedAgent?.knowledge_bases || []).length > 0 && (
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginRight: 4 }}>📚</span>
                    {(selectedAgent?.knowledgeBases || selectedAgent?.knowledge_bases || []).map((kbId: string) => {
                      const isActive = activeKBs.has(kbId);
                      return (
                        <button
                          key={kbId}
                          onClick={() => setActiveKBs((prev) => {
                            const next = new Set(prev);
                            if (next.has(kbId)) next.delete(kbId); else next.add(kbId);
                            return next;
                          })}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                            background: isActive ? "rgba(168,85,247,0.1)" : colors.badgeBg,
                            border: isActive ? "1px solid rgba(168,85,247,0.25)" : `1px solid ${colors.badgeBorder}`,
                            color: isActive ? "#a78bfa" : colors.textMuted,
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: isActive ? "#a78bfa" : colors.textMuted,
                            boxShadow: isActive ? "0 0 6px rgba(168,85,247,0.4)" : "none",
                          }} />
                          {kbNames[kbId] || kbId.replace(/^kb_/, "")}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div
                  className="flex gap-3 items-center rounded-[14px] transition-all"
                  style={{
                    padding: "8px 8px 8px 20px",
                    background: theme === "dark" ? "linear-gradient(165deg, rgba(20,38,62,0.8), rgba(14,30,52,0.85))" : colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    boxShadow: theme === "dark" ? "inset 0 1px 0 rgba(34,211,238,0.06), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => { setInput(e.target.value); if (e.target.value) setSuggestionsVisible(false); else setSuggestionsVisible(true); }}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent first"}
                    disabled={sending || !selectedAgent}
                    className="flex-1 bg-transparent border-none outline-none text-[15px]"
                    style={{ color: colors.textPrimary }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim() || !selectedAgent}
                    className="btn-reef-primary"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

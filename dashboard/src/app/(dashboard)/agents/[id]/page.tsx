"use client";
import { getAuthHeaders } from "@/lib/auth";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ReefMarkdown } from "@/components/custom/reef-markdown";
import { useRouter } from "next/navigation";
import { Agent, K8sEvent, deployAgent, stopAgent, restartAgent, deleteAgent, fetchAgentEvents, Release, ReleaseDiff, fetchReleases, createRelease, getRelease, deployRelease, diffReleases, CanaryStatus, startCanary, adjustCanaryWeight, getCanaryStatus, promoteCanary, rollbackCanary, EvalRun, EvalDataset, EvalComparison, fetchEvalRuns, triggerEval, compareEvalRuns, fetchDatasets, uploadDataset } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusColors: Record<string, { bg: string; glow: string }> = {
  registered: { bg: "#eab308", glow: "rgba(234,179,8,0.5)" },
  evaluating: { bg: "#3b82f6", glow: "rgba(59,130,246,0.5)" },
  evaluated: { bg: "#22d3ee", glow: "rgba(34,211,238,0.5)" },
  deployed: { bg: "#22c55e", glow: "rgba(34,197,94,0.5)" },
  eval_failed: { bg: "#ef4444", glow: "rgba(239,68,68,0.5)" },
  deploy_failed: { bg: "#ef4444", glow: "rgba(239,68,68,0.5)" },
};

const phaseColors: Record<string, { dot: string; glow: string }> = {
  Running: { dot: "#22c55e", glow: "rgba(34,197,94,0.6)" },
  Pending: { dot: "#eab308", glow: "rgba(234,179,8,0.6)" },
  Failed: { dot: "#ef4444", glow: "rgba(239,68,68,0.6)" },
  Stopped: { dot: "#94a3b8", glow: "rgba(148,163,184,0.4)" },
  Created: { dot: "#94a3b8", glow: "rgba(148,163,184,0.4)" },
};

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
}

interface AgentVersion {
  id: string;
  version: string;
  created_at: string;
  config?: Record<string, unknown>;
}

/* ---- Shared label style for Config tab ---- */
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#64748b",
  marginBottom: 6,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f1f5f9",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

/* ---- YAML builder ---- */
function buildAgentYaml(agent: Agent): string {
  const slug = agent.name?.toLowerCase().replace(/\s+/g, "-") || agent.id;
  const lines = [
    "apiVersion: agents.recif.dev/v1",
    "kind: Agent",
    "metadata:",
    `  name: ${slug}`,
    "  namespace: team-default",
    "spec:",
    `  name: "${agent.name}"`,
    `  framework: ${agent.framework || "corail"}`,
    `  strategy: ${agent.strategy || "agent-react"}`,
    `  channel: ${agent.channel || "rest"}`,
    `  modelType: ${agent.model_type || "vertex-ai"}`,
    `  modelId: ${agent.model_id || "gemini-2.5-flash"}`,
    `  image: ${agent.image || "corail:latest"}`,
    `  replicas: ${agent.replicas ?? 1}`,
  ];
  // storage is intentionally omitted when empty — the operator will pick
  // postgresql if a DATABASE_URL is configured, otherwise memory.
  if (agent.storage) {
    lines.splice(7, 0, `  storage: ${agent.storage}`);
  }
  if (agent.system_prompt) {
    lines.push(`  systemPrompt: |`);
    for (const pLine of agent.system_prompt.split("\n")) {
      lines.push(`    ${pLine}`);
    }
  }
  return lines.join("\n");
}

/* ---- Config form interface ---- */
interface ConfigFormData {
  model_type: string;
  model_id: string;
  gcp_service_account: string;
  strategy: string;
  channel: string;
  storage: string;
  system_prompt: string;
  replicas: number;
  image: string;
  tools: string[];
  knowledgeBases: string[];
  skills: string[];
}

const AVAILABLE_SKILLS = [
  { id: "agui-render", name: "Rich Rendering", description: "3D scenes, charts, flow diagrams, HTML preview" },
  { id: "code-review", name: "Code Review", description: "Expert code analysis, security, performance" },
  { id: "doc-writer", name: "Documentation", description: "Technical writing, API docs, tutorials" },
  { id: "data-analyst", name: "Data Analysis", description: "Statistical analysis with visualizations" },
  { id: "infra-deployer", name: "Infra Deployer", description: "Deploy Récif — Kind, Helm, Terraform, K8s operations" },
];

const AVAILABLE_TOOLS = [
  { name: "datetime", type: "builtin", description: "Get current date and time" },
  { name: "calculator", type: "builtin", description: "Evaluate math expressions" },
  { name: "web_search", type: "builtin", description: "Search the web via DuckDuckGo" },
  { name: "fetch_url", type: "builtin", description: "Fetch and extract content from a web page" },
  { name: "github-issues", type: "http", description: "GitHub issues API" },
  { name: "kubectl", type: "cli", description: "Kubernetes CLI" },
];

type TabKey = "overview" | "deployment" | "chat" | "config" | "releases" | "eval";

export default function AgentDetailPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const params = useParams();
  const agentId = params?.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const agentSlug = agent?.slug || agent?.name || agentId;
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // Chat state -- persist conversationId in localStorage per agent
  const storageKey = `recif-chat-${agentId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey);
    }
    return null;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingCidRef = useRef<string | null>(null);

  // Deployment YAML copy state
  const [yamlCopied, setYamlCopied] = useState(false);

  // Deploy / Stop / Restart action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Scale UI state
  const [showScaleInput, setShowScaleInput] = useState(false);
  const [scaleValue, setScaleValue] = useState(1);

  const handleAgentAction = async (action: "deploy" | "stop" | "restart") => {
    if (!agent) return;
    setActionLoading(action);
    setActionMsg(null);
    try {
      const fn = { deploy: deployAgent, stop: stopAgent, restart: restartAgent }[action];
      const updated = await fn(agentId);
      if (updated) setAgent((prev) => prev ? { ...prev, ...updated } : prev);
      setActionMsg({ type: "success", text: `Agent ${action === "deploy" ? "deployed" : action === "stop" ? "stopped" : "restarted"} successfully.` });
      // Re-fetch after a short delay to get updated phase from operator
      setTimeout(async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/agents/${agentId}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            setAgent(data.data);
          }
        } catch { /* best effort */ }
      }, 3000);
    } catch (err) {
      setActionMsg({ type: "error", text: `Failed to ${action}: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleScale = async (newReplicas: number) => {
    if (!agent) return;
    setActionLoading("scale");
    setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/config`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ replicas: newReplicas }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgent((prev) => prev ? { ...prev, replicas: newReplicas } : prev);
      setActionMsg({ type: "success", text: `Scaled to ${newReplicas} replica${newReplicas !== 1 ? "s" : ""}.` });
      setShowScaleInput(false);
    } catch (err) {
      setActionMsg({ type: "error", text: `Failed to scale: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Config tab state
  const [configForm, setConfigForm] = useState<ConfigFormData>({
    model_type: "",
    model_id: "",
    gcp_service_account: "",
    strategy: "",
    channel: "",
    storage: "",
    system_prompt: "",
    replicas: 1,
    image: "",
    tools: [],
    knowledgeBases: [],
    skills: [],
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [availableKBs, setAvailableKBs] = useState<{ id: string; name: string; description: string }[]>([]);

  // Versions tab expand state
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  // Releases tab state
  const [releases, setReleases] = useState<Release[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [expandedRelease, setExpandedRelease] = useState<number | null>(null);
  const [releaseArtifact, setReleaseArtifact] = useState<Record<string, unknown> | null>(null);
  const [releaseDiffs, setReleaseDiffs] = useState<ReleaseDiff[]>([]);
  const [showDiff, setShowDiff] = useState<{ from: number; to: number } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [deployingVersion, setDeployingVersion] = useState<number | null>(null);

  // K8s Events state
  const [k8sEvents, setK8sEvents] = useState<K8sEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Canary state
  const [canaryStatus, setCanaryStatus] = useState<CanaryStatus | null>(null);
  const [canaryLoading, setCanaryLoading] = useState(false);
  const [canaryMsg, setCanaryMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Eval tab state
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [evalDatasets, setEvalDatasets] = useState<EvalDataset[]>([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalTriggering, setEvalTriggering] = useState(false);
  const [evalSelectedDataset, setEvalSelectedDataset] = useState<string>("");
  const [evalExpandedRun, setEvalExpandedRun] = useState<string | null>(null);
  const [evalCompareA, setEvalCompareA] = useState<string | null>(null);
  const [evalCompareB, setEvalCompareB] = useState<string | null>(null);
  const [evalComparison, setEvalComparison] = useState<EvalComparison | null>(null);
  const [evalCompareLoading, setEvalCompareLoading] = useState(false);
  const [evalShowUpload, setEvalShowUpload] = useState(false);
  const [evalUploadName, setEvalUploadName] = useState("");
  const [evalUploadFile, setEvalUploadFile] = useState<File | null>(null);
  const [evalUploading, setEvalUploading] = useState(false);
  const [evalMsg, setEvalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Derive agent slug from name
  const getSlug = useCallback(() => {
    return agent?.name?.toLowerCase().replace(/\s+/g, "-") || agentId;
  }, [agent, agentId]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/conversations`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch { /* best effort */ }
  }, [getSlug]);

  const loadConversation = async (cid: string) => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSending(false);
    streamingCidRef.current = null;

    setConversationId(cid);
    localStorage.setItem(storageKey, cid);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/conversations/${cid}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const loaded: ChatMessage[] = (data.messages || []).map((m: { role: string; content: string }) => ({
          role: m.role === "user" ? "user" as const : "agent" as const,
          content: m.content,
        }));
        setMessages(loaded);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    let retries = 0;
    const maxRetries = 10; // ~30s total (3s intervals)

    const loadAgent = () => {
      Promise.all([
        fetch(`${API_URL}/api/v1/agents/${agentId}`, { headers: getAuthHeaders() }).then(r => {
          if (!r.ok) throw new Error(`status_${r.status}`);
          return r.json();
        }),
        fetch(`${API_URL}/api/v1/agents/${agentId}/versions`, { headers: getAuthHeaders() }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`${API_URL}/api/v1/knowledge-bases`, { headers: getAuthHeaders() }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
        .then(([agentRes, versionsRes, kbsRes]) => {
          if (cancelled) return;
          const agentData = agentRes.data;
          setAvailableKBs((kbsRes.data || []).map((kb: { id: string; name: string; description: string }) => ({ id: kb.id, name: kb.name, description: kb.description || "" })));
          setAgent(agentData);
          setVersions(versionsRes.data || []);
          if (agentData) {
            setScaleValue(agentData.replicas ?? 1);
            setConfigForm({
              model_type: agentData.model_type || "vertex-ai",
              model_id: agentData.model_id || "",
              gcp_service_account: agentData.gcp_service_account || "",
              strategy: agentData.strategy || "agent-react",
              channel: agentData.channel || "rest",
              storage: agentData.storage || "",
              system_prompt: agentData.system_prompt || "",
              replicas: agentData.replicas ?? 1,
              image: agentData.image || "ghcr.io/recif-platform/corail:latest",
              tools: agentData.tools || [],
              knowledgeBases: agentData.knowledgeBases || agentData.knowledge_bases || [],
              skills: agentData.skills || [],
            });
          }
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          retries++;
          if (retries < maxRetries) {
            // Agent may not exist yet (ArgoCD deploying) — retry
            setTimeout(loadAgent, 3000);
          } else {
            setError("Agent not found after waiting for deployment.");
            setLoading(false);
          }
        });
    };

    loadAgent();
    return () => { cancelled = true; };
  }, [agentId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch conversation list when entering chat tab
  useEffect(() => {
    if (tab === "chat") {
      fetchConversations();
    }
  }, [tab, fetchConversations]);

  // Fetch K8s events and canary status when entering deployment tab
  useEffect(() => {
    if (tab === "deployment" && agentId) {
      setEventsLoading(true);
      fetchAgentEvents(agentId)
        .then(setK8sEvents)
        .catch(() => setK8sEvents([]))
        .finally(() => setEventsLoading(false));

      getCanaryStatus(agentId)
        .then(setCanaryStatus)
        .catch(() => setCanaryStatus(null));
    }

    // Fetch eval runs for both deployment (canary scores) and eval tabs
    if ((tab === "deployment" || tab === "eval") && agentId) {
      fetchEvalRuns(agentSlug)
        .then(setEvalRuns)
        .catch(() => setEvalRuns([]));
    }
  }, [tab, agentId]);

  // Fetch releases + canary status when entering releases tab
  useEffect(() => {
    if (tab === "releases" && agentId) {
      setReleasesLoading(true);
      fetchReleases(agentId)
        .then(setReleases)
        .catch(() => setReleases([]))
        .finally(() => setReleasesLoading(false));
      getCanaryStatus(agentId)
        .then(setCanaryStatus)
        .catch(() => setCanaryStatus(null));
    }
  }, [tab, agentId]);

  // Fetch eval datasets when entering eval tab (runs already fetched above)
  useEffect(() => {
    if (tab === "eval" && agentId) {
      setEvalLoading(true);
      fetchDatasets(agentSlug)
        .then((datasets) => {
          setEvalDatasets(datasets);
          if (datasets.length > 0 && !evalSelectedDataset) {
            setEvalSelectedDataset(datasets[0].name);
          }
        })
        .catch(() => setEvalDatasets([]))
        .finally(() => setEvalLoading(false));
    }
  }, [tab, agentId]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);

    // Track which conversation this stream belongs to
    const activeCid = conversationId;
    streamingCidRef.current = activeCid;

    // Add empty agent message that we'll stream into
    setMessages((prev) => [...prev, { role: "agent", content: "" }]);

    // Create AbortController for this stream
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${getSlug()}/chat/stream`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ input: userMsg, conversation_id: conversationId }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
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
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "agent") {
                      updated[updated.length - 1] = { ...last, content: last.content + data.token };
                    }
                    return updated;
                  });
                }
                if (data.done && streamingCidRef.current === activeCid) {
                  setSending(false);
                }
                if (data.conversation_id && streamingCidRef.current === activeCid) {
                  setConversationId(data.conversation_id);
                  localStorage.setItem(storageKey, data.conversation_id);
                }
              } catch { /* skip malformed JSON */ }
            }
          }
        }
      }
    } catch (err) {
      // Don't show error if we intentionally aborted (conversation switch)
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (streamingCidRef.current === activeCid) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "agent" && last.content === "") {
            updated[updated.length - 1] = { ...last, content: "Error: Could not reach the agent." };
          }
          return updated;
        });
      }
    } finally {
      if (streamingCidRef.current === activeCid) {
        setSending(false);
        streamingCidRef.current = null;
      }
      abortRef.current = null;
      // Refresh conversation list (picks up titles)
      fetchConversations();
      // Refresh again after LLM title upgrade (3s delay + inference)
      setTimeout(() => fetchConversations(), 8000);
    }
  };

  const handleConfigSave = async () => {
    if (!agent) return;
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      // Map form fields to CRD camelCase field names
      const payload: Record<string, unknown> = {
        modelType: configForm.model_type,
        modelId: configForm.model_id,
        strategy: configForm.strategy,
        channel: configForm.channel,
        storage: configForm.storage,
        systemPrompt: configForm.system_prompt,
        replicas: configForm.replicas,
        image: configForm.image,
        tools: configForm.tools,
        knowledgeBases: configForm.knowledgeBases,
        skills: configForm.skills,
      };
      if (configForm.gcp_service_account) {
        payload.gcpServiceAccount = configForm.gcp_service_account;
      }
      // Save config — the API emits AgentConfigChanged which triggers
      // a release automatically via the release handler. No need to call
      // POST /releases separately.
      const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/config`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setConfigMsg({
        type: "success",
        text: "Configuration saved and applied successfully.",
      });
    } catch (err) {
      setConfigMsg({ type: "error", text: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setConfigSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl animate-pulse" style={{ background: "rgba(34,211,238,0.05)" }} />
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: "rgba(34,211,238,0.03)" }} />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="reef-glass" style={{ padding: "24px" }}>
        <p style={{ color: "#f87171" }}>Agent not found or API unreachable.</p>
        <Link href="/agents" className="text-sm hover:underline mt-2 block" style={{ color: "#22d3ee" }}>Back to agents</Link>
      </div>
    );
  }

  const sc = statusColors[agent.status] || { bg: "#94a3b8", glow: "rgba(148,163,184,0.5)" };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "deployment", label: "Deployment" },
    { key: "releases", label: "Releases" },
    { key: "config", label: "Config" },
    { key: "eval", label: "Evaluation" },
  ];

  const agentYaml = buildAgentYaml(agent);
  const phase = agent.phase || agent.status || "Pending";
  const pc = phaseColors[phase] || phaseColors.Pending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 style={{ color: colors.textPrimary }}>{agent.name}</h2>
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: sc.bg, boxShadow: `0 0 8px ${sc.glow}` }}
            />
            <span className="text-sm" style={{ color: colors.textMuted }}>{agent.status}</span>
          </div>
          <p className="text-sm font-mono mt-1" style={{ color: colors.textMuted }}>{agent.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!confirm(`Delete agent "${agent.name}"? This will remove the agent, its CRD, and all K8s resources.`)) return;
              try {
                await deleteAgent(agentId);
                router.push("/agents");
              } catch (err) {
                setActionMsg({ type: "error", text: `Delete failed: ${err instanceof Error ? err.message : "Unknown error"}` });
              }
            }}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            Delete
          </button>
          <Link href="/agents" className="text-sm transition-colors" style={{ color: colors.textMuted }}>Back</Link>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(34,211,238,0.06)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              ...(tab === t.key
                ? {
                    background: "rgba(34,211,238,0.08)",
                    color: colors.textPrimary,
                    fontWeight: 500,
                    boxShadow: "inset 0 1px 0 rgba(34,211,238,0.1), 0 2px 6px rgba(0,0,0,0.2)",
                    border: "1px solid rgba(34,211,238,0.12)",
                  }
                : {
                    background: "transparent",
                    color: colors.textMuted,
                    border: "1px solid transparent",
                  }),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left column: Agent Details + Infrastructure stacked */}
          <div className="flex flex-col gap-4">
          {/* Agent Details */}
          <div className="reef-glass" style={{ padding: "24px" }}>
            <h3 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600 }}>Agent Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Framework</span><span className="font-medium" style={{ color: colors.textSecondary }}>{agent.framework.toUpperCase()}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Version</span><span className="font-mono font-medium" style={{ color: colors.textSecondary }}>v{agent.version}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Status</span>
                <span
                  className="px-2 py-0.5 rounded-full text-sm font-semibold"
                  style={{
                    ...(agent.status === "deployed" ? { background: "rgba(34,197,94,0.15)", color: "#4ade80" } :
                      agent.status === "registered" ? { background: "rgba(234,179,8,0.15)", color: "#facc15" } :
                      agent.status.includes("fail") ? { background: "rgba(239,68,68,0.15)", color: "#f87171" } :
                      { background: "rgba(148,163,184,0.15)", color: colors.badgeText }),
                  }}
                >{agent.status}</span>
              </div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Description</span><span className="text-right max-w-[60%]" style={{ color: colors.textSecondary }}>{agent.description || "\u2014"}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Created</span><span style={{ color: colors.textSecondary }}>{new Date(agent.created_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted, fontWeight: 400 }}>Team</span><span className="font-mono text-sm" style={{ color: colors.textSecondary }}>Default</span></div>
            </div>
          </div>

          {/* Infrastructure */}
          <div className="reef-glass" style={{ padding: "24px" }}>
            <h3 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600 }}>Infrastructure</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Runtime</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.image || "corail:latest"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Platform</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: colors.textSecondary, fontWeight: 500 }}>
                  <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.1 2L4 9v14l12.1 7L28 23V9L16.1 2z" stroke="#326CE5" strokeWidth="1.5" fill="rgba(50,108,229,0.15)"/>
                    <path d="M16 8l-6 3.5v7L16 22l6-3.5v-7L16 8z" stroke="#326CE5" strokeWidth="1.2" fill="none"/>
                  </svg>
                  Kubernetes
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Channel</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.channel || "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Model</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>
                  {agent.model_type && agent.model_id ? `${agent.model_type}/${agent.model_id}` : agent.model_type || agent.model_id || "\u2014"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Strategy</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.strategy || "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Storage</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.storage || "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Replicas</span>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.replicas ?? 1}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>Endpoint</span>
                <span className="font-mono text-sm break-all" style={{ color: colors.textSecondary, fontWeight: 500 }}>{agent.endpoint || "\u2014"}</span>
              </div>
            </div>
          </div>
          </div>

          {/* Right column: Topology */}
          <div className="reef-glass" style={{ padding: "24px" }}>
            <h3 className="mb-4" style={{ color: colors.textPrimary, fontWeight: 600 }}>Topology</h3>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              {/* Model Node */}
              <div
                style={{
                  padding: "14px 24px",
                  borderRadius: 14,
                  background: "rgba(34,211,238,0.06)",
                  border: "1px solid rgba(34,211,238,0.2)",
                  boxShadow: "0 0 16px rgba(34,211,238,0.08), inset 0 1px 0 rgba(34,211,238,0.1)",
                  textAlign: "center",
                  minWidth: 180,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#22d3ee" }}>Model</span>
                </div>
                <span className="font-mono text-sm" style={{ color: colors.textSecondary }}>
                  {agent.model_type && agent.model_id
                    ? `${agent.model_type} / ${agent.model_id}`
                    : agent.model_type || agent.model_id || "Not configured"}
                </span>
              </div>

              {/* Connector: Model -> Agent */}
              <div style={{ width: 2, height: 28, background: "linear-gradient(180deg, rgba(34,211,238,0.3), rgba(244,114,182,0.3))" }} />

              {/* Agent Node */}
              <div
                style={{
                  padding: "14px 28px",
                  borderRadius: 14,
                  background: "rgba(244,114,182,0.06)",
                  border: "1px solid rgba(244,114,182,0.2)",
                  boxShadow: "0 0 16px rgba(244,114,182,0.08), inset 0 1px 0 rgba(244,114,182,0.1)",
                  textAlign: "center",
                  minWidth: 200,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#f472b6" }}>Agent</span>
                </div>
                <span className="font-medium text-sm" style={{ color: colors.textPrimary }}>{agent.name}</span>
                {agent.strategy && (
                  <div className="font-mono text-xs mt-1" style={{ color: colors.textMuted }}>{agent.strategy}</div>
                )}
              </div>

              {/* Connector: Agent -> bottom row (branching) */}
              <div style={{ width: 2, height: 16, background: "rgba(244,114,182,0.2)" }} />

              {/* Horizontal connector bar */}
              <div style={{ position: "relative", width: "80%", maxWidth: 600, height: 2, background: "rgba(255,255,255,0.08)" }}>
                {/* Vertical stubs down from the bar */}
                <div style={{ position: "absolute", left: "12.5%", top: 0, width: 2, height: 16, background: "rgba(34,197,94,0.3)", transform: "translateX(-1px)" }} />
                <div style={{ position: "absolute", left: "37.5%", top: 0, width: 2, height: 16, background: "rgba(168,85,247,0.3)", transform: "translateX(-1px)" }} />
                <div style={{ position: "absolute", left: "62.5%", top: 0, width: 2, height: 16, background: "rgba(249,115,22,0.3)", transform: "translateX(-1px)" }} />
                <div style={{ position: "absolute", left: "87.5%", top: 0, width: 2, height: 16, background: "rgba(250,204,21,0.3)", transform: "translateX(-1px)" }} />
              </div>

              {/* Bottom row: Tools, Skills, KBs, Memory */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, width: "80%", maxWidth: 600, marginTop: 14 }}>
                {/* Tools */}
                {(() => {
                  const toolsList = agent.tools || [];
                  const isEmpty = toolsList.length === 0;
                  return (
                    <div
                      style={{
                        padding: "12px 10px",
                        borderRadius: 12,
                        background: isEmpty ? "rgba(255,255,255,0.02)" : "rgba(34,197,94,0.05)",
                        border: `1px solid ${isEmpty ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.2)"}`,
                        textAlign: "center",
                        opacity: isEmpty ? 0.5 : 1,
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#22c55e" }}>Tools</span>
                      </div>
                      <span className="font-mono text-sm font-semibold" style={{ color: isEmpty ? colors.textMuted : "#4ade80" }}>
                        {toolsList.length}
                      </span>
                      {toolsList.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                          {toolsList.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs" style={{ color: colors.textMuted, fontSize: 10 }}>{t}</span>
                          ))}
                          {toolsList.length > 3 && <span className="text-xs" style={{ color: colors.textMuted, fontSize: 10 }}>+{toolsList.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Skills */}
                {(() => {
                  const skillsList = agent.skills || [];
                  const isEmpty = skillsList.length === 0;
                  return (
                    <div
                      style={{
                        padding: "12px 10px",
                        borderRadius: 12,
                        background: isEmpty ? "rgba(255,255,255,0.02)" : "rgba(168,85,247,0.05)",
                        border: `1px solid ${isEmpty ? "rgba(255,255,255,0.05)" : "rgba(168,85,247,0.2)"}`,
                        textAlign: "center",
                        opacity: isEmpty ? 0.5 : 1,
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a855f7" }}>Skills</span>
                      </div>
                      <span className="font-mono text-sm font-semibold" style={{ color: isEmpty ? colors.textMuted : "#c084fc" }}>
                        {skillsList.length}
                      </span>
                      {skillsList.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                          {skillsList.slice(0, 3).map((s) => {
                            const meta = AVAILABLE_SKILLS.find((sk) => sk.id === s);
                            return <span key={s} className="text-xs" style={{ color: colors.textMuted, fontSize: 10 }}>{meta?.name || s}</span>;
                          })}
                          {skillsList.length > 3 && <span className="text-xs" style={{ color: colors.textMuted, fontSize: 10 }}>+{skillsList.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Knowledge Bases */}
                {(() => {
                  const kbs = agent.knowledgeBases || agent.knowledge_bases || [];
                  const isEmpty = kbs.length === 0;
                  return (
                    <div
                      style={{
                        padding: "12px 10px",
                        borderRadius: 12,
                        background: isEmpty ? "rgba(255,255,255,0.02)" : "rgba(249,115,22,0.05)",
                        border: `1px solid ${isEmpty ? "rgba(255,255,255,0.05)" : "rgba(249,115,22,0.2)"}`,
                        textAlign: "center",
                        opacity: isEmpty ? 0.5 : 1,
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#f97316" }}>KBs</span>
                      </div>
                      <span className="font-mono text-sm font-semibold" style={{ color: isEmpty ? colors.textMuted : "#fb923c" }}>
                        {kbs.length}
                      </span>
                    </div>
                  );
                })()}

                {/* Memory */}
                {(() => {
                  // Empty storage means "let the operator decide" — displayed as auto.
                  const memBackend = agent.storage || "auto";
                  return (
                    <div
                      style={{
                        padding: "12px 10px",
                        borderRadius: 12,
                        background: "rgba(250,204,21,0.05)",
                        border: "1px solid rgba(250,204,21,0.2)",
                        textAlign: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#eab308" }}>Memory</span>
                      </div>
                      <span className="font-mono text-xs" style={{ color: "#facc15" }}>
                        {memBackend}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Tools & Skills */}
          <div className="md:col-span-2 reef-glass" style={{ padding: "24px" }}>
            <h3 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600 }}>Tools & Skills</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase mb-2" style={{ color: colors.textMuted, fontWeight: 800, letterSpacing: "0.1em" }}>Tools</p>
                {agent.tools && agent.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {agent.tools.map((t) => (
                      <span
                        key={t}
                        className="inline-block rounded-lg text-xs font-medium"
                        style={{
                          padding: "4px 10px",
                          background: "rgba(34,211,238,0.08)",
                          border: "1px solid rgba(34,211,238,0.15)",
                          color: "#22d3ee",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: colors.textMuted }}>No tools assigned</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase mb-2" style={{ color: colors.textMuted, fontWeight: 800, letterSpacing: "0.1em" }}>Skills</p>
                {agent.skills && agent.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {agent.skills.map((s) => {
                      const meta = AVAILABLE_SKILLS.find((sk) => sk.id === s);
                      return (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium"
                          style={{
                            padding: "4px 10px",
                            background: "rgba(6,182,212,0.08)",
                            border: "1px solid rgba(6,182,212,0.2)",
                            color: "#06b6d4",
                          }}
                          title={meta?.description}
                        >
                          {meta?.name || s}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: colors.textMuted }}>No skills assigned</p>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {tab === "deployment" && (
        <div className="reef-glass" style={{ padding: "24px" }}>
          <div className="flex items-center gap-3 mb-5">
            <h3 style={{ color: colors.textPrimary, fontWeight: 600 }}>Deployment</h3>
            <span
              className="inline-flex items-center gap-2 rounded-full text-xs font-bold"
              style={{
                padding: "5px 14px",
                ...(phase === "Running"
                  ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }
                  : phase === "Pending"
                  ? { background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#facc15" }
                  : phase === "Failed"
                  ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }
                  : phase === "Created"
                  ? { background: "transparent", border: `1px solid ${colors.badgeBorder}`, color: colors.badgeText }
                  : { background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.2)", color: "#94a3b8" }),
              }}
            >
              <span
                className="inline-flex h-2 w-2 rounded-full"
                style={{ background: pc?.dot || "#94a3b8", boxShadow: `0 0 6px ${pc?.glow || "rgba(148,163,184,0.4)"}` }}
              />
              {phase}
            </span>
          </div>

          {/* Info grid */}
          <div
            className="grid gap-x-8 gap-y-3 text-sm mb-6"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Status</span>
              <span className="flex items-center gap-1.5 font-medium" style={{ color: pc?.dot || "#94a3b8" }}>
                <span className="inline-flex h-2 w-2 rounded-full" style={{ background: pc?.dot || "#94a3b8" }} />
                {phase}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Version</span>
              <span className="font-mono font-medium" style={{ color: colors.textSecondary }}>
                {agent.version ? `v${agent.version}` : "\u2014"}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Image</span>
              <span className="font-mono font-medium" style={{ color: colors.textSecondary }}>
                {agent.image || "corail:latest"}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Replicas</span>
              <span className="font-mono font-medium" style={{ color: colors.textSecondary }}>
                {phase === "Running" ? `${agent.replicas ?? 1}/${agent.replicas ?? 1} ready` : `0/${agent.replicas ?? 1} ready`}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Namespace</span>
              <span className="font-mono font-medium" style={{ color: colors.textSecondary }}>team-default</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textMuted }}>Uptime</span>
              <span className="font-medium" style={{ color: colors.textSecondary }}>
                {(() => {
                  const ts = agent.created_at;
                  if (!ts) return "\u2014";
                  const diff = Date.now() - new Date(ts).getTime();
                  if (diff < 0) return "\u2014";
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `since ${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `since ${hrs}h ago`;
                  const days = Math.floor(hrs / 24);
                  return `since ${days}d ago`;
                })()}
              </span>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-3">
            {(phase === "Created" || phase === "Stopped" || phase === "registered") && (
              <button
                onClick={() => handleAgentAction("deploy")}
                disabled={actionLoading !== null}
                style={{
                  padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                  color: "#4ade80", cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading === "deploy" ? 0.6 : 1,
                  transition: "all 0.2s",
                  boxShadow: "0 2px 8px rgba(34,197,94,0.15)",
                }}
              >
                {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
              </button>
            )}
            {phase === "Running" && (
              <button
                onClick={() => handleAgentAction("restart")}
                disabled={actionLoading !== null}
                style={{
                  padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)",
                  color: "#facc15", cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading === "restart" ? 0.6 : 1,
                  transition: "all 0.2s",
                  boxShadow: "0 2px 8px rgba(234,179,8,0.15)",
                }}
              >
                {actionLoading === "restart" ? "Restarting..." : "Restart"}
              </button>
            )}

            {/* Scale button + inline input */}
            <div className="flex items-center gap-2">
              {!showScaleInput ? (
                <button
                  onClick={() => { setScaleValue(agent.replicas ?? 1); setShowScaleInput(true); }}
                  disabled={actionLoading !== null}
                  style={{
                    padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: colors.accentBg, border: `1px solid ${colors.accentBorder}`,
                    color: colors.accent, cursor: actionLoading ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  Scale
                </button>
              ) : (
                <div
                  className="flex items-center gap-2 rounded-xl"
                  style={{
                    padding: "4px 6px 4px 14px",
                    background: colors.accentBg,
                    border: `1px solid ${colors.accentBorder}`,
                  }}
                >
                  <span className="text-xs font-semibold" style={{ color: colors.accent }}>Replicas</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={scaleValue}
                    onChange={(e) => setScaleValue(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    style={{
                      width: 48, textAlign: "center",
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.accentBorder}`,
                      borderRadius: 8, padding: "4px 4px", fontSize: 13, fontWeight: 600,
                      color: colors.textPrimary, outline: "none",
                    }}
                  />
                  <button
                    onClick={() => handleScale(scaleValue)}
                    disabled={actionLoading === "scale"}
                    style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                      color: "#4ade80", cursor: actionLoading === "scale" ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {actionLoading === "scale" ? "..." : "Apply"}
                  </button>
                  <button
                    onClick={() => setShowScaleInput(false)}
                    style={{
                      padding: "4px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: "transparent", border: "none",
                      color: colors.textMuted, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Stop -- right-aligned, visually separated */}
            {phase === "Running" && (
              <button
                onClick={() => handleAgentAction("stop")}
                disabled={actionLoading !== null}
                style={{
                  marginLeft: "auto",
                  padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#f87171", cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading === "stop" ? 0.6 : 1,
                  transition: "all 0.2s",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.15)",
                }}
              >
                {actionLoading === "stop" ? "Stopping..." : "Stop"}
              </button>
            )}
          </div>

          {/* Inline feedback message */}
          {actionMsg && (
            <div
              className="mt-4 rounded-xl text-sm font-medium"
              style={{
                padding: "10px 16px",
                background: actionMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${actionMsg.type === "success" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                color: actionMsg.type === "success" ? "#4ade80" : "#f87171",
              }}
            >
              {actionMsg.text}
            </div>
          )}

          {/* ---- Canary Deployment ---- */}
          <div style={{ marginTop: 24 }}>
            <h4 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 15 }}>Canary Deployment</h4>

            {canaryMsg && (
              <div
                className="mb-3 rounded-xl text-sm font-medium"
                style={{
                  padding: "10px 16px",
                  background: canaryMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${canaryMsg.type === "success" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: canaryMsg.type === "success" ? "#4ade80" : "#f87171",
                }}
              >
                {canaryMsg.text}
              </div>
            )}

            {/* Active Canary Status */}
            {canaryStatus?.enabled && (
              <div
                className="rounded-2xl"
                style={{
                  padding: "20px 24px",
                  background: "rgba(234,179,8,0.04)",
                  border: "1px solid rgba(234,179,8,0.15)",
                }}
              >
                {/* Side by side: Champion vs Challenger */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Champion */}
                  <div
                    className="rounded-xl"
                    style={{
                      padding: "16px",
                      background: "rgba(34,211,238,0.04)",
                      border: "1px solid rgba(34,211,238,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.05em" }}>CHAMPION</span>
                      <span className="ml-auto font-mono text-xs" style={{ color: "#22d3ee" }}>{100 - canaryStatus.weight}%</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Version</span><span className="font-mono" style={{ color: colors.textSecondary }}>{canaryStatus.champion_version || agent.version}</span></div>
                      <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Model</span><span className="font-mono" style={{ color: colors.textSecondary }}>{agent.model_id || "-"}</span></div>
                    </div>
                    {(() => {
                      const run = evalRuns.find(r => r.agent_version === (canaryStatus.champion_version || agent.version));
                      if (!run) return null;
                      const vals = Object.values(run.aggregate_scores);
                      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                      return (
                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(34,211,238,0.1)" }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: colors.textMuted }}>Eval Score</span>
                            <span className="font-mono text-sm font-bold" style={{ color: avg >= 0.8 ? "#4ade80" : avg >= 0.6 ? "#facc15" : "#f87171" }}>{(avg * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Challenger */}
                  <div
                    className="rounded-xl"
                    style={{
                      padding: "16px",
                      background: "rgba(251,146,60,0.04)",
                      border: "1px solid rgba(251,146,60,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.05em" }}>CHALLENGER</span>
                      <span className="ml-auto font-mono text-xs" style={{ color: "#fb923c" }}>{canaryStatus.weight}%</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Version</span><span className="font-mono" style={{ color: colors.textSecondary }}>{canaryStatus.challenger_version || "canary"}</span></div>
                      <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Model</span><span className="font-mono" style={{ color: colors.textSecondary }}>{canaryStatus.challenger_model_id || agent.model_id || "-"}</span></div>
                    </div>
                    {(() => {
                      const run = evalRuns.find(r => r.agent_version === (canaryStatus.challenger_version || "canary"));
                      if (!run) return null;
                      const vals = Object.values(run.aggregate_scores);
                      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                      return (
                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(251,146,60,0.1)" }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: colors.textMuted }}>Eval Score</span>
                            <span className="font-mono text-sm font-bold" style={{ color: avg >= 0.8 ? "#4ade80" : avg >= 0.6 ? "#facc15" : "#f87171" }}>{(avg * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Weight slider */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...fieldLabelStyle, color: "#facc15" }}>Traffic Split: {canaryStatus.weight}% canary</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={canaryStatus.weight}
                      onChange={(e) => setCanaryStatus((prev) => prev ? { ...prev, weight: parseInt(e.target.value) } : prev)}
                      style={{ flex: 1, accentColor: "#facc15" }}
                    />
                    <button
                      disabled={canaryLoading}
                      onClick={async () => {
                        if (!canaryStatus) return;
                        setCanaryLoading(true);
                        setCanaryMsg(null);
                        try {
                          const updated = await adjustCanaryWeight(agentId, canaryStatus.weight);
                          setCanaryStatus(updated);
                          setCanaryMsg({ type: "success", text: `Weight adjusted to ${canaryStatus.weight}%.` });
                        } catch (err) {
                          setCanaryMsg({ type: "error", text: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                        } finally {
                          setCanaryLoading(false);
                        }
                      }}
                      style={{
                        padding: "4px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)",
                        color: "#facc15", cursor: canaryLoading ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      Apply
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div className="flex mt-2 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{ width: `${100 - canaryStatus.weight}%`, background: "rgba(34,197,94,0.5)", transition: "width 0.3s" }} />
                    <div style={{ width: `${canaryStatus.weight}%`, background: "rgba(234,179,8,0.5)", transition: "width 0.3s" }} />
                  </div>
                  <div className="flex justify-between mt-1 text-xs" style={{ color: colors.textMuted }}>
                    <span>Champion {100 - canaryStatus.weight}%</span>
                    <span>Challenger {canaryStatus.weight}%</span>
                  </div>
                </div>

                {/* Promote / Rollback buttons */}
                <div className="flex gap-3">
                  <button
                    disabled={canaryLoading}
                    onClick={async () => {
                      setCanaryLoading(true);
                      setCanaryMsg(null);
                      try {
                        await promoteCanary(agentId);
                        setCanaryStatus(null);
                        setCanaryMsg({ type: "success", text: "Canary promoted to stable. All traffic now goes to the new version." });
                      } catch (err) {
                        setCanaryMsg({ type: "error", text: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                      } finally {
                        setCanaryLoading(false);
                      }
                    }}
                    style={{
                      padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                      color: "#4ade80", cursor: canaryLoading ? "not-allowed" : "pointer",
                      boxShadow: "0 2px 8px rgba(34,197,94,0.15)",
                      transition: "all 0.2s",
                    }}
                  >
                    Promote
                  </button>
                  <button
                    disabled={canaryLoading}
                    onClick={async () => {
                      setCanaryLoading(true);
                      setCanaryMsg(null);
                      try {
                        await rollbackCanary(agentId);
                        setCanaryStatus(null);
                        setCanaryMsg({ type: "success", text: "Canary rolled back. All traffic restored to stable." });
                      } catch (err) {
                        setCanaryMsg({ type: "error", text: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                      } finally {
                        setCanaryLoading(false);
                      }
                    }}
                    style={{
                      padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                      color: "#f87171", cursor: canaryLoading ? "not-allowed" : "pointer",
                      boxShadow: "0 2px 8px rgba(239,68,68,0.15)",
                      transition: "all 0.2s",
                    }}
                  >
                    Rollback
                  </button>
                </div>
              </div>
            )}

            {/* No canary active */}
            {!canaryStatus?.enabled && (
              <div
                className="text-sm text-center"
                style={{
                  color: colors.textMuted,
                  padding: "24px 16px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12,
                }}
              >
                No canary active. Go to the <button onClick={() => setTab("releases")} style={{ color: colors.accent, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: "inherit", fontWeight: 600 }}>Releases</button> tab to start a canary from a specific release version.
              </div>
            )}
          </div>

          {/* CRD YAML */}
          <div style={{ position: "relative", marginTop: 20 }}>
            <span
              style={{
                position: "absolute", top: 8, left: 16,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "1px", color: "#22d3ee", opacity: 0.6,
              }}
            >
              yaml
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(agentYaml);
                setYamlCopied(true);
                setTimeout(() => setYamlCopied(false), 2000);
              }}
              style={{
                position: "absolute", top: 8, right: 8, zIndex: 2,
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: yamlCopied ? "rgba(34,197,94,0.15)" : "rgba(34,211,238,0.1)",
                border: `1px solid ${yamlCopied ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.15)"}`,
                color: yamlCopied ? "#4ade80" : "#94a3b8",
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {yamlCopied ? "Copied" : "Copy YAML"}
            </button>
            <pre
              style={{
                background: "rgba(4,14,26,0.8)",
                border: "1px solid rgba(34,211,238,0.1)",
                borderRadius: 12,
                padding: "32px 20px 16px",
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#cbd5e1",
                overflowX: "auto",
                whiteSpace: "pre",
                fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
                boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              {agentYaml}
            </pre>
          </div>

          {/* Recent Events */}
          <div style={{ marginTop: 24 }}>
            <h4 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 15 }}>Recent Events</h4>
            {eventsLoading ? (
              <div className="text-sm" style={{ color: colors.textMuted, padding: "16px 0" }}>Loading events...</div>
            ) : k8sEvents.length === 0 ? (
              <div
                className="text-sm text-center"
                style={{
                  color: colors.textMuted,
                  padding: "24px 16px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12,
                }}
              >
                No events yet
              </div>
            ) : (
              <div style={{ position: "relative", paddingLeft: 24 }}>
                {/* Vertical timeline line */}
                <div
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 4,
                    bottom: 4,
                    width: 2,
                    background: "linear-gradient(180deg, rgba(34,211,238,0.3), rgba(34,211,238,0.05))",
                    borderRadius: 1,
                  }}
                />
                <div className="space-y-1">
                  {k8sEvents.map((evt, idx) => {
                    const isWarning = evt.type === "Warning";
                    const dotColor = isWarning ? "#eab308" : "#22c55e";
                    const dotGlow = isWarning ? "rgba(234,179,8,0.5)" : "rgba(34,197,94,0.5)";
                    // Format timestamp
                    let timeLabel = "";
                    if (evt.timestamp) {
                      try {
                        const d = new Date(evt.timestamp);
                        const diff = Date.now() - d.getTime();
                        if (diff < 60000) timeLabel = "just now";
                        else if (diff < 3600000) timeLabel = `${Math.floor(diff / 60000)}m ago`;
                        else if (diff < 86400000) timeLabel = `${Math.floor(diff / 3600000)}h ago`;
                        else timeLabel = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      } catch {
                        timeLabel = evt.timestamp;
                      }
                    }
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3"
                        style={{
                          position: "relative",
                          padding: "10px 14px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.04)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                      >
                        {/* Timeline dot */}
                        <div
                          style={{
                            position: "absolute",
                            left: -21,
                            top: 16,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: dotColor,
                            boxShadow: `0 0 8px ${dotGlow}`,
                            border: "2px solid rgba(4,14,26,0.9)",
                          }}
                        />
                        {/* Timestamp */}
                        <span
                          className="shrink-0 text-xs font-mono"
                          style={{ color: colors.textMuted, width: 60, paddingTop: 2 }}
                        >
                          {timeLabel}
                        </span>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-mono font-bold text-xs"
                              style={{ color: isWarning ? "#facc15" : "#4ade80" }}
                            >
                              {evt.reason}
                            </span>
                            {evt.count > 1 && (
                              <span
                                className="text-xs rounded-full"
                                style={{
                                  padding: "1px 7px",
                                  background: "rgba(255,255,255,0.06)",
                                  color: colors.textMuted,
                                  fontSize: 10,
                                }}
                              >
                                x{evt.count}
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-0.5" style={{ color: colors.textSecondary, lineHeight: 1.5 }}>
                            {evt.message}
                          </p>
                          <span className="text-xs" style={{ color: colors.textMuted, opacity: 0.7 }}>
                            {evt.object_kind}/{evt.object_name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "chat" && (
        <div className="flex gap-4" style={{ height: "560px" }}>
          {/* Conversation sidebar */}
          <div className="w-64 shrink-0 reef-glass flex flex-col">
            <div
              className="px-[18px] py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="uppercase" style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>Conversations</span>
              <button
                onClick={() => {
                  if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
                  setSending(false);
                  streamingCidRef.current = null;
                  setMessages([]);
                  setConversationId(null);
                  localStorage.removeItem(storageKey);
                }}
                className="btn-reef"
              >
                + New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="p-4 text-sm text-center" style={{ color: colors.textMuted }}>No conversations yet</div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => loadConversation(c.id)}
                      className="w-full text-left rounded-xl transition-all mb-0.5"
                      style={{
                        padding: "14px",
                        background: conversationId === c.id ? "rgba(34,211,238,0.06)" : "transparent",
                        border: conversationId === c.id ? "1px solid rgba(34,211,238,0.12)" : "1px solid transparent",
                        boxShadow: conversationId === c.id ? "inset 0 0 16px rgba(6,182,212,0.03), 0 2px 8px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      <div className="text-sm font-medium truncate" style={{ color: colors.textSecondary }}>
                        {c.title || `Conversation ${c.id.slice(0, 8)}`}
                      </div>
                      <div className="flex items-center gap-2.5 mt-1.5 text-sm" style={{ color: colors.textMuted }}>
                        <span>{c.message_count} msg{c.message_count !== 1 ? "s" : ""}</span>
                        <span>{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 reef-glass flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto relative z-[1]" style={{ padding: "32px" }}>
              <div className="flex flex-col gap-5">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-sm" style={{ color: colors.textMuted }}>
                    Send a message to start chatting with {agent.name}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="max-w-[70%] rounded-2xl"
                    style={{
                      padding: "16px 20px",
                      fontSize: "16px",
                      lineHeight: "1.7",
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      borderBottomRightRadius: m.role === "user" ? "6px" : undefined,
                      borderBottomLeftRadius: m.role === "agent" ? "6px" : undefined,
                      ...(m.role === "user" ? {
                        background: "linear-gradient(165deg, #0ea5e9, #0891b2)",
                        color: "white",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.1), 0 4px 16px rgba(6,182,212,0.3), 0 8px 24px rgba(0,0,0,0.15)",
                      } : {
                        background: "linear-gradient(165deg, rgba(30,50,75,0.9), rgba(20,38,62,0.92))",
                        border: "1px solid rgba(34,211,238,0.08)",
                        color: colors.textSecondary,
                        boxShadow: "inset 0 1px 0 rgba(34,211,238,0.08), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.2)",
                      }),
                    }}
                  >
                    <div
                      className="text-sm font-semibold uppercase tracking-wider mb-2"
                      style={{ color: m.role === "user" ? "rgba(255,255,255,0.5)" : "#f472b6" }}
                    >
                      {m.role === "user" ? "You" : agent.name}
                    </div>
                    {m.role === "agent" ? (
                      <ReefMarkdown content={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                ))}
                {sending && messages.length > 0 && messages[messages.length - 1]?.role === "agent" && messages[messages.length - 1]?.content === "" && (
                  <div
                    className="max-w-[70%] rounded-2xl text-sm italic"
                    style={{
                      padding: "16px 20px",
                      background: "linear-gradient(165deg, rgba(30,50,75,0.9), rgba(20,38,62,0.92))",
                      border: "1px solid rgba(34,211,238,0.08)",
                      color: colors.textMuted,
                      boxShadow: "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 12px rgba(0,0,0,0.2)",
                    }}
                  >Thinking...</div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="relative z-[1]" style={{ padding: "18px 24px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div
                className="flex gap-3 items-center rounded-[14px] transition-all"
                style={{
                  padding: "8px 8px 8px 20px",
                  background: "linear-gradient(165deg, rgba(20,38,62,0.8), rgba(14,30,52,0.85))",
                  border: "1px solid rgba(34,211,238,0.1)",
                  boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 bg-transparent border-none outline-none text-[15px]"
                  style={{ color: colors.textPrimary }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="btn-reef-primary"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "releases" && (
        <div className="space-y-4">
          {/* Diff Modal */}
          {showDiff && (
            <div
              style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => { setShowDiff(null); setReleaseDiffs([]); }}
            >
              <div
                className="reef-glass"
                style={{ padding: "28px", minWidth: 560, maxWidth: 700, maxHeight: "80vh", overflow: "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-semibold mb-4" style={{ color: colors.textPrimary }}>
                  Diff: v{showDiff.from} &rarr; v{showDiff.to}
                </h3>
                {diffLoading ? (
                  <p className="text-sm" style={{ color: colors.textMuted }}>Loading diff...</p>
                ) : releaseDiffs.length === 0 ? (
                  <p className="text-sm" style={{ color: colors.textMuted }}>No differences found.</p>
                ) : (
                  <div className="space-y-2">
                    {releaseDiffs.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          borderRadius: 10,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            padding: "8px 14px",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "var(--font-mono), monospace",
                            color: "#94a3b8",
                          }}
                        >
                          {d.path}
                        </div>
                        <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.06)" }}>
                          <span style={{ color: "#f87171", fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>
                            - {typeof d.from === "object" ? JSON.stringify(d.from) : String(d.from ?? "")}
                          </span>
                        </div>
                        <div style={{ padding: "8px 14px", background: "rgba(34,197,94,0.06)" }}>
                          <span style={{ color: "#4ade80", fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>
                            + {typeof d.to === "object" ? JSON.stringify(d.to) : String(d.to ?? "")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ color: colors.textMuted, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onClick={() => { setShowDiff(null); setReleaseDiffs([]); }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="reef-glass" style={{ padding: "20px 24px" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: colors.textPrimary }}>Release Pipeline</h3>
              <p className="text-xs" style={{ color: colors.textMuted }}>Releases are created automatically when you save config changes.</p>
            </div>
          </div>

          {/* Releases List */}
          <div className="reef-glass" style={{ padding: "24px" }}>
            {releasesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(34,211,238,0.03)" }} />
                ))}
              </div>
            ) : releases.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm mb-2" style={{ color: colors.textMuted }}>No releases yet.</p>
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  Create your first release to start tracking agent versions in Git.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {releases.map((rel) => {
                  const isActive = rel.status === "active";
                  const isExpanded = expandedRelease === rel.version;
                  const hasPrevious = rel.version > 1;
                  const isChampion = String(rel.version) === agent.version;
                  const isChallenger = canaryStatus?.enabled && canaryStatus.challenger_version === String(rel.version);
                  const showActions = !isChampion && !isChallenger;
                  return (
                    <div key={rel.version}>
                      <div
                        onClick={async () => {
                          if (isExpanded) {
                            setExpandedRelease(null);
                            setReleaseArtifact(null);
                          } else {
                            setExpandedRelease(rel.version);
                            try {
                              const full = await getRelease(agentId, rel.version);
                              setReleaseArtifact(full.artifact);
                            } catch {
                              setReleaseArtifact(null);
                            }
                          }
                        }}
                        className="w-full text-left rounded-xl transition-all"
                        style={{
                          padding: "14px 16px",
                          background: isExpanded ? "rgba(34,211,238,0.04)" : "rgba(255,255,255,0.03)",
                          border: isExpanded ? "1px solid rgba(34,211,238,0.12)" : "1px solid rgba(34,211,238,0.06)",
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <svg
                              width="12" height="12" viewBox="0 0 12 12"
                              style={{
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.2s",
                              }}
                            >
                              <path d="M4 2l4 4-4 4" stroke="#64748b" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-bold font-mono"
                              style={{
                                background: isActive ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.06)",
                                color: isActive ? "#22d3ee" : colors.textMuted,
                                border: isActive ? "1px solid rgba(34,211,238,0.2)" : "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              v{rel.version}
                            </span>
                            {String(rel.version) === agent.version ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", fontSize: "9px", letterSpacing: "0.05em" }}>CHAMPION</span>
                            ) : canaryStatus?.enabled && canaryStatus.challenger_version === String(rel.version) ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", fontSize: "9px", letterSpacing: "0.05em" }}>CHALLENGER</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(148,163,184,0.08)", color: "#64748b" }}>
                                {rel.status === "rejected" ? "rejected" : "available"}
                              </span>
                            )}
                            <span className="text-sm" style={{ color: colors.textSecondary }}>{rel.changelog}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {showActions && (
                              <button
                                disabled={deployingVersion === rel.version}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setDeployingVersion(rel.version);
                                  try {
                                    await deployRelease(agentId, rel.version);
                                    const updated = await fetchReleases(agentId);
                                    setReleases(updated);
                                    setActionMsg({ type: "success", text: `Deployed v${rel.version} as champion.` });
                                  } catch (err) {
                                    setActionMsg({ type: "error", text: `Deploy failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                                  } finally {
                                    setDeployingVersion(null);
                                  }
                                }}
                                style={{
                                  padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                  color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {deployingVersion === rel.version ? "..." : "Deploy"}
                              </button>
                            )}
                            {showActions && (
                              <button
                                disabled={deployingVersion === rel.version}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setDeployingVersion(rel.version);
                                  try {
                                    const status = await startCanary(agentId, rel.version, 10);
                                    setCanaryStatus(status);
                                    setActionMsg({ type: "success", text: `Canary v${rel.version} started at 10%. Go to Deployment tab to manage.` });
                                  } catch (err) {
                                    setActionMsg({ type: "error", text: `Canary failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                                  } finally {
                                    setDeployingVersion(null);
                                  }
                                }}
                                style={{
                                  padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                  color: "#fb923c", background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Canary 10%
                              </button>
                            )}
                            <span className="text-xs font-mono" style={{ color: colors.textMuted }}>
                              {rel.checksum?.substring(0, 8)}
                            </span>
                            <span className="text-sm" style={{ color: colors.textMuted }}>
                              {(() => {
                                const d = new Date(rel.timestamp);
                                const now = new Date();
                                const diffMs = now.getTime() - d.getTime();
                                const diffMins = Math.floor(diffMs / 60000);
                                if (diffMins < 1) return "just now";
                                if (diffMins < 60) return `${diffMins}m ago`;
                                const diffHours = Math.floor(diffMins / 60);
                                if (diffHours < 24) return `${diffHours}h ago`;
                                const diffDays = Math.floor(diffHours / 24);
                                return `${diffDays}d ago`;
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div
                          className="rounded-b-xl"
                          style={{
                            padding: "16px",
                            marginTop: -1,
                            background: "rgba(4,14,26,0.5)",
                            border: "1px solid rgba(34,211,238,0.08)",
                            borderTop: "none",
                            borderRadius: "0 0 12px 12px",
                          }}
                        >
                          {/* Metadata row */}
                          <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                            <div>
                              <span style={{ ...fieldLabelStyle, marginBottom: 2, display: "block" }}>Author</span>
                              <span style={{ color: colors.textSecondary }}>{rel.author}</span>
                            </div>
                            <div>
                              <span style={{ ...fieldLabelStyle, marginBottom: 2, display: "block" }}>Timestamp</span>
                              <span style={{ color: colors.textSecondary }}>{new Date(rel.timestamp).toLocaleString()}</span>
                            </div>
                            <div>
                              <span style={{ ...fieldLabelStyle, marginBottom: 2, display: "block" }}>Checksum</span>
                              <span className="font-mono text-xs" style={{ color: colors.textMuted }}>{rel.checksum}</span>
                            </div>
                          </div>

                          {/* Artifact YAML */}
                          {releaseArtifact && (
                            <div style={{ position: "relative" }}>
                              <span
                                style={{
                                  position: "absolute", top: 8, left: 16,
                                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                                  letterSpacing: "1px", color: "#22d3ee", opacity: 0.6,
                                }}
                              >
                                yaml
                              </span>
                              <pre
                                style={{
                                  background: "rgba(4,14,26,0.8)",
                                  border: "1px solid rgba(34,211,238,0.1)",
                                  borderRadius: 12,
                                  padding: "32px 20px 16px",
                                  margin: 0,
                                  fontSize: 13,
                                  lineHeight: 1.6,
                                  color: "#cbd5e1",
                                  overflowX: "auto",
                                  whiteSpace: "pre-wrap",
                                  fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
                                  boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
                                  maxHeight: 400,
                                  overflow: "auto",
                                }}
                              >
                                {JSON.stringify(releaseArtifact, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="mt-3 flex justify-end gap-3">
                            {hasPrevious && (
                              <button
                                className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                                style={{
                                  color: "#a78bfa",
                                  background: "rgba(167,139,250,0.08)",
                                  border: "1px solid rgba(167,139,250,0.15)",
                                }}
                                onClick={async () => {
                                  setShowDiff({ from: rel.version - 1, to: rel.version });
                                  setDiffLoading(true);
                                  try {
                                    const d = await diffReleases(agentId, rel.version - 1, rel.version);
                                    setReleaseDiffs(d);
                                  } catch {
                                    setReleaseDiffs([]);
                                  } finally {
                                    setDiffLoading(false);
                                  }
                                }}
                              >
                                Diff with previous
                              </button>
                            )}
                            {!isActive && (
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={deployingVersion === rel.version}
                                  onClick={async () => {
                                    setDeployingVersion(rel.version);
                                    try {
                                      await deployRelease(agentId, rel.version);
                                      const updated = await fetchReleases(agentId);
                                      setReleases(updated);
                                      setActionMsg({ type: "success", text: `Deployed v${rel.version} as stable.` });
                                    } catch (err) {
                                      setActionMsg({ type: "error", text: `Deploy failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                                    } finally {
                                      setDeployingVersion(null);
                                    }
                                  }}
                                  style={{
                                    padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                                  }}
                                >
                                  {deployingVersion === rel.version ? "Deploying..." : "Deploy Stable"}
                                </button>
                                <button
                                  disabled={deployingVersion === rel.version}
                                  onClick={async () => {
                                    setDeployingVersion(rel.version);
                                    try {
                                      await startCanary(agentId, rel.version, 10);
                                      setActionMsg({ type: "success", text: `Canary started for v${rel.version} at 10% traffic.` });
                                    } catch (err) {
                                      setActionMsg({ type: "error", text: `Canary failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                                    } finally {
                                      setDeployingVersion(null);
                                    }
                                  }}
                                  style={{
                                    padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    color: "#eab308", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)",
                                  }}
                                >
                                  Deploy Canary (10%)
                                </button>
                              </div>
                            )}
                            {isActive && (
                              <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>Active</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="reef-glass" style={{ padding: "24px" }}>
          <h3 className="font-semibold mb-6" style={{ color: colors.textPrimary }}>Agent Configuration</h3>
          <div className="grid gap-5 md:grid-cols-2">
            {/* Model Type */}
            <div>
              <label style={fieldLabelStyle}>Model Type</label>
              <select
                value={configForm.model_type}
                onChange={(e) => setConfigForm((f) => ({ ...f, model_type: e.target.value }))}
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="vertex-ai">Vertex AI</option>
                <option value="bedrock">AWS Bedrock</option>
                <option value="google-ai">Google AI Studio</option>
                <option value="stub">Stub</option>
              </select>
            </div>

            {/* Model ID */}
            <div>
              <label style={fieldLabelStyle}>Model ID</label>
              <input
                type="text"
                value={configForm.model_id}
                onChange={(e) => setConfigForm((f) => ({ ...f, model_id: e.target.value }))}
                placeholder="e.g. qwen3.5:4b, gpt-4, claude-sonnet-4-20250514"
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>

            {/* Vertex AI hint */}
            {configForm.model_type === "vertex-ai" && (
              <div className="md:col-span-2 p-3 rounded-xl" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)" }}>
                <p style={{ fontSize: 11, color: "#94a3b8" }}>
                  Requires a K8s Secret with your service account key:
                </p>
                <code className="block mt-1" style={{ fontSize: 11, color: "#22d3ee", fontFamily: "monospace" }}>
                  kubectl create secret generic {agent?.name?.toLowerCase().replace(/\s+/g, "-") || "{agent}"}-gcp-sa -n team-default --from-file=credentials.json=sa-key.json
                </code>
              </div>
            )}

            {/* Strategy */}
            <div>
              <label style={fieldLabelStyle}>Strategy</label>
              <select
                value={configForm.strategy}
                onChange={(e) => setConfigForm((f) => ({ ...f, strategy: e.target.value }))}
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <option value="agent-react">agent-react</option>
              </select>
            </div>

            {/* Channel */}
            <div>
              <label style={fieldLabelStyle}>Channel</label>
              <select
                value={configForm.channel}
                onChange={(e) => setConfigForm((f) => ({ ...f, channel: e.target.value }))}
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <option value="rest">rest</option>
                <option value="websocket">websocket</option>
                <option value="slack">slack</option>
              </select>
            </div>

            {/* Storage */}
            <div>
              <label style={fieldLabelStyle}>Storage</label>
              <select
                value={configForm.storage}
                onChange={(e) => setConfigForm((f) => ({ ...f, storage: e.target.value }))}
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <option value="memory">memory</option>
                <option value="postgresql">postgresql</option>
              </select>
            </div>

            {/* Replicas */}
            <div>
              <label style={fieldLabelStyle}>Replicas</label>
              <input
                type="number"
                min={1}
                max={10}
                value={configForm.replicas}
                onChange={(e) => setConfigForm((f) => ({ ...f, replicas: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }))}
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>

            {/* Image */}
            <div className="md:col-span-2">
              <label style={fieldLabelStyle}>Image</label>
              <input
                type="text"
                value={configForm.image}
                onChange={(e) => setConfigForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="e.g. corail:latest"
                style={fieldInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>

            {/* System Prompt */}
            <div className="md:col-span-2">
              <label style={fieldLabelStyle}>System Prompt</label>
              <textarea
                value={configForm.system_prompt}
                onChange={(e) => setConfigForm((f) => ({ ...f, system_prompt: e.target.value }))}
                placeholder="Enter the system prompt for this agent..."
                rows={5}
                style={{
                  ...fieldInputStyle,
                  resize: "vertical",
                  minHeight: 100,
                  fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>
          </div>

          {/* Tools assignment */}
          <div className="mt-6">
            <label style={fieldLabelStyle}>Assigned Tools</label>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>Select the tools this agent can use with the ReAct strategy.</p>
            <div className="grid gap-2 md:grid-cols-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const isSelected = configForm.tools.includes(tool.name);
                const typeBadge: Record<string, string> = { builtin: "#f59e0b", http: "#22d3ee", cli: "#22c55e", mcp: "#a855f7" };
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => {
                      setConfigForm((f) => ({
                        ...f,
                        tools: isSelected
                          ? f.tools.filter((t) => t !== tool.name)
                          : [...f.tools, tool.name],
                      }));
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 12, textAlign: "left",
                      background: isSelected ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.02)",
                      border: isSelected ? "1px solid rgba(34,211,238,0.25)" : "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer", transition: "all 0.15s", width: "100%",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: isSelected ? "none" : "1px solid rgba(255,255,255,0.15)",
                      background: isSelected ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "white", fontWeight: 700,
                    }}>
                      {isSelected && "✓"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>{tool.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: typeBadge[tool.type] || "#94a3b8" }}>{tool.type}</span>
                      </div>
                      <span style={{ color: colors.textMuted, fontSize: 12 }}>{tool.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Knowledge Bases assignment */}
          <div className="mt-6">
            <label style={fieldLabelStyle}>Knowledge Bases</label>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>Attach knowledge bases for RAG-powered retrieval.</p>
            <div className="grid gap-2 md:grid-cols-2">
              {availableKBs.map((kb) => {
                const isSelected = configForm.knowledgeBases.includes(kb.id);
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => {
                      setConfigForm((f) => ({
                        ...f,
                        knowledgeBases: isSelected
                          ? f.knowledgeBases.filter((k) => k !== kb.id)
                          : [...f.knowledgeBases, kb.id],
                      }));
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 12, textAlign: "left",
                      background: isSelected ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.02)",
                      border: isSelected ? "1px solid rgba(34,211,238,0.25)" : "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer", transition: "all 0.15s", width: "100%",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: isSelected ? "none" : "1px solid rgba(255,255,255,0.15)",
                      background: isSelected ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "white", fontWeight: 700,
                    }}>
                      {isSelected && "✓"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>{kb.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#a855f7" }}>KB</span>
                      </div>
                      <span style={{ color: colors.textMuted, fontSize: 12 }}>{kb.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Skills assignment */}
          <div className="mt-6">
            <label style={fieldLabelStyle}>Skills</label>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>Extend the agent with specialized capabilities.</p>
            <div className="grid gap-2 md:grid-cols-2">
              {AVAILABLE_SKILLS.map((skill) => {
                const isSelected = configForm.skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      setConfigForm((f) => ({
                        ...f,
                        skills: isSelected
                          ? f.skills.filter((s) => s !== skill.id)
                          : [...f.skills, skill.id],
                      }));
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 12, textAlign: "left",
                      background: isSelected ? "rgba(6,182,212,0.08)" : "rgba(255,255,255,0.02)",
                      border: isSelected ? "1px solid rgba(6,182,212,0.25)" : "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer", transition: "all 0.15s", width: "100%",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: isSelected ? "none" : "1px solid rgba(255,255,255,0.15)",
                      background: isSelected ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "white", fontWeight: 700,
                    }}>
                      {isSelected && "\u2713"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>{skill.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#06b6d4" }}>SKILL</span>
                      </div>
                      <span style={{ color: colors.textMuted, fontSize: 12 }}>{skill.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save button + message */}
          <div className="mt-6 flex items-center gap-4">
            <button
              className="btn-reef-primary"
              onClick={handleConfigSave}
              disabled={configSaving}
              style={{ opacity: configSaving ? 0.6 : 1 }}
            >
              {configSaving ? "Saving..." : "Save & Apply"}
            </button>
            {configMsg && (
              <span
                className="text-sm font-medium"
                style={{ color: configMsg.type === "success" ? "#4ade80" : "#f87171" }}
              >
                {configMsg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "eval" && (
        <div className="space-y-4">
          {/* MLflow external link */}
          <div className="flex justify-end">
            <a
              href="http://localhost:5000"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: colors.accent, textDecoration: "none", opacity: 0.8 }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.8"; }}
            >
              Open MLflow UI &rarr;
            </a>
          </div>
          {/* Upload Dataset Modal */}
          {evalShowUpload && (
            <div
              style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => setEvalShowUpload(false)}
            >
              <div
                className="reef-glass"
                style={{ padding: "28px", minWidth: 480, maxWidth: 560 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-semibold mb-4" style={{ color: colors.textPrimary }}>Upload Dataset</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabelStyle}>Dataset Name</label>
                  <input
                    value={evalUploadName}
                    onChange={(e) => setEvalUploadName(e.target.value)}
                    placeholder="e.g. regression-suite"
                    style={fieldInputStyle}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabelStyle}>JSONL File</label>
                  <input
                    type="file"
                    accept=".jsonl,.json"
                    onChange={(e) => setEvalUploadFile(e.target.files?.[0] || null)}
                    style={{
                      ...fieldInputStyle,
                      padding: "10px 16px",
                      cursor: "pointer",
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                    Each line: {`{"input": "...", "expected_output": "..."}`}
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ color: colors.textMuted, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onClick={() => setEvalShowUpload(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-reef"
                    disabled={evalUploading || !evalUploadName.trim()}
                    onClick={async () => {
                      setEvalUploading(true);
                      try {
                        let caseCount = 5;
                        if (evalUploadFile) {
                          const text = await evalUploadFile.text();
                          const lines = text.trim().split("\n").filter((l) => l.trim());
                          caseCount = lines.length;
                        }
                        await uploadDataset(agentSlug, evalUploadName.trim(), caseCount);
                        setEvalShowUpload(false);
                        setEvalUploadName("");
                        setEvalUploadFile(null);
                        const updated = await fetchDatasets(agentSlug);
                        setEvalDatasets(updated);
                        if (updated.length > 0 && !evalSelectedDataset) {
                          setEvalSelectedDataset(updated[0].name);
                        }
                        setEvalMsg({ type: "success", text: "Dataset uploaded successfully." });
                      } catch (err) {
                        setEvalMsg({ type: "error", text: `Failed to upload: ${err instanceof Error ? err.message : "Unknown error"}` });
                      } finally {
                        setEvalUploading(false);
                      }
                    }}
                  >
                    {evalUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compare Modal */}
          {evalComparison && (
            <div
              style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => setEvalComparison(null)}
            >
              <div
                className="reef-glass"
                style={{ padding: "28px", minWidth: 600, maxWidth: 720, maxHeight: "80vh", overflow: "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-semibold mb-2" style={{ color: colors.textPrimary }}>Run Comparison</h3>
                <p className="text-xs mb-4" style={{ color: colors.textMuted }}>
                  Overall winner:{" "}
                  <span style={{
                    fontWeight: 700,
                    color: evalComparison.winner === "a" ? "#4ade80" : evalComparison.winner === "b" ? "#facc15" : colors.textMuted,
                  }}>
                    {evalComparison.winner === "a" ? "Run A" : evalComparison.winner === "b" ? "Run B" : "Tie"}
                  </span>
                </p>

                <div className="space-y-3">
                  {Object.entries(evalComparison.metrics).map(([metric, data]) => {
                    const aLabel = metric.replace(/_/g, " ");
                    const aPct = Math.round(data.a * 100);
                    const bPct = Math.round(data.b * 100);
                    return (
                      <div key={metric} style={{
                        borderRadius: 12,
                        padding: "14px 16px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase" style={{ color: colors.textMuted, letterSpacing: "0.08em" }}>{aLabel}</span>
                          <span className="text-xs font-bold" style={{
                            color: data.winner === "a" ? "#4ade80" : data.winner === "b" ? "#facc15" : colors.textMuted,
                          }}>
                            {data.winner === "a" ? "A wins" : data.winner === "b" ? "B wins" : "Tie"}
                          </span>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs" style={{ color: "#4ade80" }}>Run A</span>
                              <span className="text-xs font-mono" style={{ color: "#4ade80" }}>{aPct}%</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ width: `${aPct}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg, rgba(74,222,128,0.6), #4ade80)" }} />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs" style={{ color: "#facc15" }}>Run B</span>
                              <span className="text-xs font-mono" style={{ color: "#facc15" }}>{bPct}%</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ width: `${bPct}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg, rgba(250,204,21,0.6), #facc15)" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ color: colors.textMuted, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onClick={() => { setEvalComparison(null); setEvalCompareA(null); setEvalCompareB(null); }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status message */}
          {evalMsg && (
            <div
              className="reef-glass text-sm"
              style={{
                padding: "10px 16px",
                color: evalMsg.type === "success" ? "#4ade80" : "#f87171",
                borderColor: evalMsg.type === "success" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
              }}
            >
              {evalMsg.text}
            </div>
          )}

          {/* Section 1: Datasets */}
          <div className="reef-glass" style={{ padding: "20px 24px" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold" style={{ color: colors.textPrimary }}>Datasets</h3>
              <button className="btn-reef" onClick={() => setEvalShowUpload(true)}>
                Upload Dataset
              </button>
            </div>

            {evalLoading ? (
              <div className="space-y-2">
                {[1, 2].map((n) => (
                  <div key={n} className="h-12 rounded-xl animate-pulse" style={{ background: "rgba(34,211,238,0.03)" }} />
                ))}
              </div>
            ) : evalDatasets.length === 0 ? (
              <p className="text-sm" style={{ color: colors.textMuted }}>No datasets yet. Upload a JSONL file to get started.</p>
            ) : (
              <div className="space-y-2">
                {evalDatasets.map((ds) => (
                  <div
                    key={ds.id || ds.name}
                    className="flex items-center justify-between rounded-xl transition-all"
                    style={{
                      padding: "10px 14px",
                      background: evalSelectedDataset === ds.name ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.03)",
                      border: evalSelectedDataset === ds.name ? "1px solid rgba(34,211,238,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                    }}
                    onClick={() => setEvalSelectedDataset(ds.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: evalSelectedDataset === ds.name ? "#22d3ee" : "rgba(255,255,255,0.15)",
                      }} />
                      <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{ds.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        {ds.case_count} cases
                      </span>
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        {new Date(ds.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Run Evaluation */}
          <div className="reef-glass" style={{ padding: "20px 24px" }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold" style={{ color: colors.textPrimary }}>Run Evaluation</h3>
                <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                  {evalSelectedDataset
                    ? `Dataset: ${evalSelectedDataset}`
                    : "Select a dataset above to run an evaluation"}
                </p>
              </div>
              <button
                className="btn-reef"
                disabled={evalTriggering || !evalSelectedDataset}
                onClick={async () => {
                  if (!evalSelectedDataset) return;
                  setEvalTriggering(true);
                  setEvalMsg(null);
                  try {
                    await triggerEval(agentSlug, evalSelectedDataset, agent.version);
                    const updated = await fetchEvalRuns(agentSlug);
                    setEvalRuns(updated);
                    setEvalMsg({ type: "success", text: "Evaluation completed successfully." });
                  } catch (err) {
                    setEvalMsg({ type: "error", text: `Eval failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                  } finally {
                    setEvalTriggering(false);
                  }
                }}
              >
                {evalTriggering ? "Running..." : "Run Evaluation"}
              </button>
            </div>
          </div>

          {/* Section 3: Evaluation History */}
          <div className="reef-glass" style={{ padding: "20px 24px" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold" style={{ color: colors.textPrimary }}>Evaluation History</h3>
              {evalCompareA && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    {evalCompareB ? "2 runs selected" : "Select a second run to compare"}
                  </span>
                  {evalCompareA && evalCompareB && (
                    <button
                      className="btn-reef text-xs"
                      style={{ padding: "4px 12px", fontSize: 11 }}
                      disabled={evalCompareLoading}
                      onClick={async () => {
                        setEvalCompareLoading(true);
                        try {
                          const result = await compareEvalRuns(agentSlug, evalCompareA, evalCompareB);
                          setEvalComparison(result);
                        } catch (err) {
                          setEvalMsg({ type: "error", text: `Compare failed: ${err instanceof Error ? err.message : "Unknown error"}` });
                        } finally {
                          setEvalCompareLoading(false);
                        }
                      }}
                    >
                      {evalCompareLoading ? "Comparing..." : "Compare"}
                    </button>
                  )}
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: colors.textMuted, background: "rgba(255,255,255,0.04)" }}
                    onClick={() => { setEvalCompareA(null); setEvalCompareB(null); }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {evalLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-20 rounded-xl animate-pulse" style={{ background: "rgba(34,211,238,0.03)" }} />
                ))}
              </div>
            ) : evalRuns.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm" style={{ color: colors.textMuted }}>No evaluation runs yet. Select a dataset and run an evaluation above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...evalRuns].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()).map((run) => {
                  const isExpanded = evalExpandedRun === run.id;
                  const isCompareSelected = evalCompareA === run.id || evalCompareB === run.id;
                  const statusStyle: Record<string, { color: string; bg: string }> = {
                    completed: { color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
                    running: { color: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
                    failed: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
                    pending: { color: "#facc15", bg: "rgba(250,204,21,0.1)" },
                  };
                  const st = statusStyle[run.status] || statusStyle.pending;

                  const scoreBarColor = (key: string): string => {
                    const colorMap: Record<string, string> = {
                      exact_match: "#22d3ee",
                      contains: "#4ade80",
                      latency: "#a78bfa",
                    };
                    return colorMap[key] || colors.accent;
                  };

                  const scoreBarBg = (key: string): string => {
                    const colorMap: Record<string, string> = {
                      exact_match: "rgba(34,211,238,0.15)",
                      contains: "rgba(74,222,128,0.15)",
                      latency: "rgba(167,139,250,0.15)",
                    };
                    return colorMap[key] || "rgba(34,211,238,0.15)";
                  };

                  return (
                    <div key={run.id}>
                      <div
                        className="rounded-xl transition-all"
                        style={{
                          padding: "14px 16px",
                          background: isCompareSelected ? "rgba(34,211,238,0.06)" : isExpanded ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                          border: isCompareSelected ? "1px solid rgba(34,211,238,0.2)" : isExpanded ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.06)",
                          cursor: "pointer",
                        }}
                        onClick={() => setEvalExpandedRun(isExpanded ? null : run.id)}
                      >
                        {/* Header row */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {/* Compare checkbox */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (evalCompareA === run.id) {
                                  setEvalCompareA(evalCompareB);
                                  setEvalCompareB(null);
                                } else if (evalCompareB === run.id) {
                                  setEvalCompareB(null);
                                } else if (!evalCompareA) {
                                  setEvalCompareA(run.id);
                                } else if (!evalCompareB) {
                                  setEvalCompareB(run.id);
                                }
                              }}
                              style={{
                                width: 16, height: 16, borderRadius: 4,
                                border: isCompareSelected ? "2px solid #22d3ee" : "2px solid rgba(255,255,255,0.15)",
                                background: isCompareSelected ? "rgba(34,211,238,0.2)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                                cursor: "pointer",
                              }}
                            >
                              {isCompareSelected && (
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: "#22d3ee" }} />
                              )}
                            </div>

                            {/* Version badge */}
                            {run.agent_version && (
                              <span
                                className="text-xs font-mono font-bold"
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "rgba(34,211,238,0.1)",
                                  border: "1px solid rgba(34,211,238,0.15)",
                                  color: "#22d3ee",
                                }}
                              >
                                v{run.agent_version}
                              </span>
                            )}

                            <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                              {run.dataset_name}
                            </span>

                            {/* Status badge */}
                            <span
                              className="text-xs font-bold uppercase"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: st.bg,
                                color: st.color,
                                letterSpacing: "0.05em",
                              }}
                            >
                              {run.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs" style={{ color: colors.textMuted }}>
                              {run.passed_cases}/{run.total_cases} passed
                            </span>
                            <span className="text-xs" style={{ color: colors.textMuted }}>
                              {new Date(run.started_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Score bars */}
                        {run.aggregate_scores && Object.keys(run.aggregate_scores).length > 0 && (
                          <div className="flex gap-3 mt-1">
                            {Object.entries(run.aggregate_scores).map(([key, val]) => {
                              const pct = Math.round(val * 100);
                              const barColor = scoreBarColor(key);
                              return (
                                <div key={key} className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs" style={{ color: colors.textMuted }}>{key.replace(/_/g, " ")}</span>
                                    <span className="text-xs font-mono font-bold" style={{ color: barColor }}>{pct}%</span>
                                  </div>
                                  <div style={{
                                    height: 6, borderRadius: 3,
                                    background: scoreBarBg(key),
                                    overflow: "hidden",
                                  }}>
                                    <div style={{
                                      width: `${pct}%`,
                                      height: "100%",
                                      borderRadius: 3,
                                      background: pct >= 80 ? barColor : pct >= 60 ? "#facc15" : "#f87171",
                                      transition: "width 0.4s ease",
                                    }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div
                          style={{
                            margin: "0 8px",
                            padding: "14px 16px",
                            background: "rgba(255,255,255,0.02)",
                            borderLeft: "2px solid rgba(34,211,238,0.15)",
                            borderBottomLeftRadius: 8,
                            borderBottomRightRadius: 8,
                          }}
                        >
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span style={{ color: colors.textMuted }}>Run ID</span>
                              <p className="font-mono" style={{ color: colors.textSecondary }}>{run.id}</p>
                            </div>
                            <div>
                              <span style={{ color: colors.textMuted }}>Dataset</span>
                              <p style={{ color: colors.textSecondary }}>{run.dataset_name}</p>
                            </div>
                            <div>
                              <span style={{ color: colors.textMuted }}>Version</span>
                              <p style={{ color: colors.textSecondary }}>{run.agent_version || "N/A"}</p>
                            </div>
                            <div>
                              <span style={{ color: colors.textMuted }}>Started</span>
                              <p style={{ color: colors.textSecondary }}>{new Date(run.started_at).toLocaleString()}</p>
                            </div>
                            {run.completed_at && (
                              <div>
                                <span style={{ color: colors.textMuted }}>Completed</span>
                                <p style={{ color: colors.textSecondary }}>{new Date(run.completed_at).toLocaleString()}</p>
                              </div>
                            )}
                            <div>
                              <span style={{ color: colors.textMuted }}>Cases</span>
                              <p style={{ color: colors.textSecondary }}>{run.passed_cases} passed / {run.total_cases} total</p>
                            </div>
                          </div>

                          {/* Detailed score breakdown */}
                          {run.aggregate_scores && (
                            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                              <span className="text-xs font-bold uppercase" style={{ color: colors.textMuted, letterSpacing: "0.08em" }}>
                                Score Breakdown
                              </span>
                              <div className="mt-2 space-y-2">
                                {Object.entries(run.aggregate_scores).map(([key, val]) => {
                                  const pct = Math.round(val * 100);
                                  const barColor = scoreBarColor(key);
                                  return (
                                    <div key={key} className="flex items-center gap-3">
                                      <span className="text-xs w-24" style={{ color: colors.textMuted }}>{key.replace(/_/g, " ")}</span>
                                      <div className="flex-1" style={{ height: 10, borderRadius: 5, background: scoreBarBg(key), overflow: "hidden" }}>
                                        <div style={{
                                          width: `${pct}%`,
                                          height: "100%",
                                          borderRadius: 5,
                                          background: pct >= 80 ? barColor : pct >= 60 ? "#facc15" : "#f87171",
                                        }} />
                                      </div>
                                      <span className="text-xs font-mono font-bold w-10 text-right" style={{ color: barColor }}>{pct}%</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

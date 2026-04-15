"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { inputStyle } from "@/lib/styles";

// --- Constants ---

const FRAMEWORKS: Record<string, { name: string; description: string }> = {
  corail: { name: "Corail-ReAct", description: "Récif native runtime. ReAct reasoning loop, tools, skills, memory, guards, AG-UI built-in." },
  langchain: { name: "LangChain", description: "Popular framework with chains, agents, and extensive tool ecosystem." },
  crewai: { name: "CrewAI", description: "Multi-agent orchestration with role-based agent teams." },
  autogen: { name: "AutoGen", description: "Microsoft's framework for multi-agent conversations." },
};

const READY_STEPS = ["Type", "Name", "Provider", "Prompt", "Tools", "Skills", "Channel", "Review"];
const CUSTOM_STEPS = ["Type", "Name", "Framework", "Capabilities", "Channel", "Delivery", "Review"];

const CHANNELS = [
  { id: "rest", name: "REST API", description: "HTTP API + SSE streaming. Used by the Récif dashboard and any REST client." },
  { id: "discord", name: "Discord", description: "Discord bot with slash commands (/chat, /clear, /status). Requires a DISCORD_BOT_TOKEN secret." },
];

const BUILTIN_TOOLS = [
  { id: "web_search", name: "Web Search", description: "Search the web via DuckDuckGo" },
  { id: "fetch_url", name: "Fetch URL", description: "Fetch and extract content from a web page" },
  { id: "calculator", name: "Calculator", description: "Evaluate mathematical expressions" },
  { id: "datetime", name: "Date & Time", description: "Get current date, time, and timezone info" },
];

const AVAILABLE_SKILLS = [
  { id: "agui-render", name: "Rich Rendering", description: "3D scenes, charts, flow diagrams, HTML preview" },
  { id: "code-review", name: "Code Review", description: "Expert code analysis, security, performance" },
  { id: "doc-writer", name: "Documentation", description: "Technical writing, API docs, tutorials" },
  { id: "data-analyst", name: "Data Analysis", description: "Statistical analysis with visualizations" },
  { id: "infra-deployer", name: "Infra Deployer", description: "Deploy Récif — Kind, Helm, Terraform, K8s operations" },
];

const PROVIDERS = [
  { id: "ollama", name: "Ollama", description: "Local models — Qwen, Llama, Mistral…", models: ["qwen3.5:35b", "qwen3.5:4b", "llama3.3:70b", "mistral:7b", "deepseek-r1:32b"] },
  { id: "anthropic", name: "Anthropic", description: "Claude — Opus, Sonnet, Haiku", models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-20250506"] },
  { id: "openai", name: "OpenAI", description: "GPT-4o, GPT-4, o3…", models: ["gpt-4o", "gpt-4", "gpt-4o-mini", "o3-mini"] },
  { id: "vertex-ai", name: "Vertex AI", description: "Google Cloud — Gemini models", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] },
  { id: "bedrock", name: "AWS Bedrock", description: "Claude, Titan, Llama on AWS", models: ["anthropic.claude-sonnet-4-20250514-v1:0", "anthropic.claude-haiku-4-20250506-v1:0", "amazon.titan-text-premier-v2:0"] },
  { id: "google-ai", name: "Google AI Studio", description: "Gemini via API key", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] },
];

const CAPABILITIES = [
  { id: "internet_access", name: "Internet Access", description: "Agent can browse the web and make HTTP requests" },
  { id: "code_execution", name: "Code Execution", description: "Agent can run code in a sandboxed environment" },
  { id: "pii_access", name: "PII Access", description: "Agent handles personally identifiable information" },
  { id: "file_system", name: "File System", description: "Agent can read/write files" },
  { id: "database_access", name: "Database Access", description: "Agent connects to databases" },
  { id: "external_apis", name: "External APIs", description: "Agent calls third-party APIs" },
  { id: "payments", name: "Payments", description: "Agent processes financial transactions" },
];

const DOCS_BASE = "https://recif-platform.github.io/docs";
const STEP_DOCS: Record<string, string> = {
  Provider: "/guides/llm-providers",
  Prompt: "/guides/create-agent",
  Tools: "/guides/create-agent",
  Skills: "/guides/create-agent",
  Channel: "/corail/channels",
  Framework: "/quickstart",
  Capabilities: "/guides/governance",
  Delivery: "/quickstart",
};

function DocLink({ step }: { step: string }) {
  const path = STEP_DOCS[step];
  if (!path) return null;
  return (
    <a
      href={`${DOCS_BASE}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open documentation"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.05)",
        color: "#64748b",
        fontSize: "10px",
        fontWeight: 700,
        marginLeft: "6px",
        verticalAlign: "middle",
        textDecoration: "none",
        transition: "all 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(34,211,238,0.4)";
        e.currentTarget.style.color = "#22d3ee";
        e.currentTarget.style.background = "rgba(34,211,238,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        e.currentTarget.style.color = "#64748b";
        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
      }}
    >
      ?
    </a>
  );
}


const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

// --- Card style helpers ---

function cardStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "12px 16px",
    color: selected ? "#22d3ee" : "#e2e8f0",
    background: selected ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.04)",
    border: selected ? "1px solid rgba(34,211,238,0.25)" : "1px solid rgba(255,255,255,0.08)",
    boxShadow: selected ? "inset 0 0 16px rgba(6,182,212,0.03), 0 2px 8px rgba(0,0,0,0.1)" : "none",
  };
}

function typeCardStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "32px 28px",
    color: selected ? "#22d3ee" : "#e2e8f0",
    background: selected ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.03)",
    border: selected ? "2px solid rgba(34,211,238,0.4)" : "2px solid rgba(255,255,255,0.06)",
    boxShadow: selected
      ? "inset 0 0 24px rgba(6,182,212,0.04), 0 4px 16px rgba(0,0,0,0.15)"
      : "0 2px 4px rgba(0,0,0,0.1)",
    textAlign: "left" as const,
    cursor: "pointer",
    flex: 1,
  };
}

// --- Component ---

export default function CreateAgentWizard() {
  const { colors } = useTheme();

  // Shared state
  const [step, setStep] = useState(0);
  const [agentType, setAgentType] = useState<"ready" | "custom">("ready");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Shared channel state
  const [channel, setChannel] = useState("rest");

  // Ready-to-use state
  const [provider, setProvider] = useState("ollama");
  const [modelId, setModelId] = useState("qwen3.5:35b");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [tools, setTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  // Custom dev state
  const [framework, setFramework] = useState("corail");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [delivery, setDelivery] = useState<"github" | "zip">("github");
  const [githubToken, setGithubToken] = useState("");
  const [githubOrg, setGithubOrg] = useState("");
  const [repoName, setRepoName] = useState("");
  const [scaffoldResult, setScaffoldResult] = useState<{ status: string; repo_url?: string } | null>(null);

  const steps = agentType === "ready" ? READY_STEPS : CUSTOM_STEPS;
  const totalSteps = steps.length;
  const lastStep = totalSteps - 1;
  const selectedProvider = PROVIDERS.find((p) => p.id === provider);

  // When switching agent type, reset step to 0
  const handleTypeChange = (type: "ready" | "custom") => {
    setAgentType(type);
    setResult(null);
    setScaffoldResult(null);
  };

  const canProceed = (): boolean => {
    const currentStepName = steps[step];
    switch (currentStepName) {
      case "Type":
        return true;
      case "Name":
        return name.trim().length > 0;
      case "Provider":
        return provider.length > 0 && modelId.length > 0;
      case "Prompt":
        return systemPrompt.trim().length > 0;
      case "Framework":
        return framework.length > 0;
      case "Channel":
        return true;
      case "Capabilities":
        return true; // optional
      case "Delivery":
        if (delivery === "github") return githubToken.trim().length > 0 && githubOrg.trim().length > 0 && repoName.trim().length > 0;
        return true;
      default:
        return true;
    }
  };

  const handleProviderChange = (id: string) => {
    setProvider(id);
    const p = PROVIDERS.find((pr) => pr.id === id);
    if (p && p.models.length > 0) {
      setModelId(p.models[0]);
    }
  };

  const handleCreateReady = async () => {
    setCreating(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${API_URL}/api/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          agent_type: "ready",
          framework: "corail",
          version: "0.1.0",
          model_type: provider,
          model_id: modelId,
          channel,
          tools,
          skills,
          env_secrets: channel === "discord" ? ["agent-env", "discord-bot"] : ["agent-env"],
        }),
      });
      const data = await res.json();
      const newId = data?.data?.id;
      if (newId) {
        // Auto-deploy the agent
        try {
          await fetch(`${API_URL}/api/v1/agents/${newId}/deploy`, { method: "POST" });
        } catch {
          // Deploy failed, agent still created — user can deploy manually
        }
        window.location.href = `/agents`;
        return;
      }
      setResult("Created!");
    } catch {
      setResult("Error creating agent. Check that the API is running.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCustom = async () => {
    setCreating(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const body = {
        name,
        description,
        agent_type: "custom",
        framework,
        capabilities,
        delivery: {
          method: delivery,
          ...(delivery === "github" && {
            github_token: githubToken,
            github_org: githubOrg,
            repo_name: repoName,
          }),
        },
      };
      const res = await fetch(`${API_URL}/api/v1/scaffold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (delivery === "zip") {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setResult("Download started!");
      } else {
        const data = await res.json();
        setScaffoldResult(data);
        setResult(`Repository created: ${data.repo_url}`);
      }
    } catch {
      setResult("Error generating scaffold. Check that the API is running.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = () => {
    if (agentType === "ready") {
      handleCreateReady();
    } else {
      handleCreateCustom();
    }
  };

  // --- Render step content ---

  const renderStepContent = () => {
    const currentStepName = steps[step];

    switch (currentStepName) {
      case "Type":
        return (
          <div className="space-y-4">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>
              Agent Type
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => handleTypeChange("ready")}
                className="rounded-2xl transition-all"
                style={typeCardStyle(agentType === "ready")}
              >
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>&#x1F680;</div>
                <span style={{ fontWeight: 700, fontSize: "16px", display: "block" }}>Ready-to-use</span>
                <span className="block text-xs mt-2" style={{ color: agentType === "ready" ? "rgba(34,211,238,0.7)" : "#64748b", fontWeight: 400, lineHeight: "1.5" }}>
                  Configure and deploy instantly. No code required. Pick a model, set a prompt, attach tools and knowledge bases.
                </span>
              </button>
              <button
                onClick={() => handleTypeChange("custom")}
                className="rounded-2xl transition-all"
                style={typeCardStyle(agentType === "custom")}
              >
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>&#x1F4BB;</div>
                <span style={{ fontWeight: 700, fontSize: "16px", display: "block" }}>Custom Development</span>
                <span className="block text-xs mt-2" style={{ color: agentType === "custom" ? "rgba(34,211,238,0.7)" : "#64748b", fontWeight: 400, lineHeight: "1.5" }}>
                  Scaffold a full project with your framework of choice. Get a GitHub repo or downloadable ZIP with Dockerfile, CI/CD, and eval config pre-wired.
                </span>
              </button>
            </div>
          </div>
        );

      case "Name":
        return (
          <div className="space-y-4">
            <div>
              <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>Agent Name</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (delivery === "github" && !repoName) setRepoName(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                className="w-full rounded-xl text-sm outline-none"
                style={{ padding: "12px 16px", ...inputStyle }}
                placeholder="my-agent"
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl text-sm h-20 outline-none"
                style={{ padding: "12px 16px", ...inputStyle, resize: "vertical" }}
                placeholder="What does this agent do?"
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>
          </div>
        );

      case "Provider":
        return (
          <div className="space-y-4">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>LLM Provider<DocLink step="Provider" /></label>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className="text-left rounded-xl transition-all"
                  style={cardStyle(provider === p.id)}
                >
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{p.name}</span>
                  <span className="block text-xs mt-1" style={{ color: colors.textMuted, fontWeight: 400 }}>{p.description}</span>
                </button>
              ))}
            </div>
            {selectedProvider && (
              <div>
                <label className="block mb-2 mt-4" style={{ ...labelStyle, color: colors.textMuted }}>Model</label>
                <div className="space-y-2">
                  {selectedProvider.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModelId(m)}
                      className="block w-full text-left rounded-xl transition-all font-mono text-sm"
                      style={{
                        padding: "10px 16px",
                        color: modelId === m ? "#22d3ee" : "#cbd5e1",
                        background: modelId === m ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.02)",
                        border: modelId === m ? "1px solid rgba(34,211,238,0.25)" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {provider === "vertex-ai" && (
              <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)" }}>
                <p className="text-xs" style={{ color: "#94a3b8" }}>
                  Create a K8s Secret with your service account key before deploying:
                </p>
                <code className="block text-xs mt-2" style={{ color: "#22d3ee", fontFamily: "monospace", lineHeight: 1.6 }}>
                  kubectl create secret generic {name ? `${name.toLowerCase().replace(/\s+/g, "-")}` : "{agent}"}-gcp-sa -n team-default --from-file=credentials.json=sa-key.json
                </code>
              </div>
            )}
          </div>
        );

      case "Prompt":
        return (
          <div className="space-y-2">
            <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>System Prompt<DocLink step="Prompt" /></label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-xl text-sm h-40 font-mono outline-none"
              style={{ padding: "12px 16px", ...inputStyle, resize: "vertical" }}
              placeholder="You are a helpful assistant."
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            />
            <p className="text-xs" style={{ color: "#475569", fontWeight: 400 }}>{systemPrompt.length} characters</p>
          </div>
        );

      case "Tools":
        return (
          <div className="space-y-3">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Built-in Tools<DocLink step="Tools" /></label>
            {BUILTIN_TOOLS.map((tool) => {
              const selected = tools.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  onClick={() =>
                    setTools((prev) =>
                      selected ? prev.filter((t) => t !== tool.id) : [...prev, tool.id]
                    )
                  }
                  className="block w-full text-left rounded-xl transition-all"
                  style={cardStyle(selected)}
                >
                  <span style={{ fontWeight: 600 }}>{tool.name}</span>
                  <span className="block text-xs mt-1" style={{ color: colors.textMuted, fontWeight: 400 }}>{tool.description}</span>
                </button>
              );
            })}
            <p className="text-xs mt-2" style={{ color: "#475569", fontWeight: 400 }}>
              {tools.length === 0 ? "No tools selected — the agent will only use the LLM." : `${tools.length} tool${tools.length > 1 ? "s" : ""} selected.`}
            </p>
            <Link href="/tools" style={{ fontSize: 12, fontWeight: 500, color: colors.textMuted }}>
              Manage Tools &rarr;
            </Link>
          </div>
        );

      case "Skills":
        return (
          <div className="space-y-3">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Agent Skills<DocLink step="Skills" /></label>
            <p className="text-xs mb-3" style={{ color: "#475569", fontWeight: 400 }}>
              Skills extend the agent with specialized capabilities. Select any that apply.
            </p>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_SKILLS.map((skill) => {
                const selected = skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    onClick={() =>
                      setSkills((prev) =>
                        selected ? prev.filter((s) => s !== skill.id) : [...prev, skill.id]
                      )
                    }
                    className="rounded-xl transition-all"
                    style={{
                      ...cardStyle(selected),
                      minWidth: "180px",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{skill.name}</span>
                    <span className="block text-xs mt-1" style={{ color: selected ? "rgba(34,211,238,0.6)" : "#64748b", fontWeight: 400 }}>
                      {skill.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: "#475569", fontWeight: 400 }}>
              {skills.length === 0 ? "No skills selected." : `${skills.length} skill${skills.length > 1 ? "s" : ""} selected.`}
            </p>
            <a href="/skills" style={{ fontSize: 12, fontWeight: 500, color: colors.textMuted }}>
              Manage Skills &rarr;
            </a>
          </div>
        );

      case "Channel":
        return (
          <div className="space-y-3">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Channel<DocLink step="Channel" /></label>
            <p className="text-xs mb-3" style={{ color: "#475569", fontWeight: 400 }}>
              How users interact with your agent. You can change this later in the Config tab.
            </p>
            {CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChannel(ch.id)}
                className="block w-full text-left rounded-xl transition-all"
                style={cardStyle(channel === ch.id)}
              >
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{ch.name}</span>
                <span className="block text-xs mt-1" style={{ color: channel === ch.id ? "rgba(34,211,238,0.6)" : colors.textMuted, fontWeight: 400 }}>
                  {ch.description}
                </span>
              </button>
            ))}
            {channel === "discord" && (
              <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)" }}>
                <p className="text-xs" style={{ color: "#94a3b8" }}>
                  Create a Discord bot at{" "}
                  <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" style={{ color: "#22d3ee" }}>
                    discord.com/developers
                  </a>
                  , then store the token as a K8s Secret:
                </p>
                <code className="block text-xs mt-2" style={{ color: "#22d3ee", fontFamily: "monospace", lineHeight: 1.6 }}>
                  kubectl create secret generic discord-bot -n team-default --from-literal=DISCORD_BOT_TOKEN=your-token
                </code>
                <p className="text-xs mt-2" style={{ color: "#475569" }}>
                  See{" "}
                  <a href={`${DOCS_BASE}/corail/channels`} target="_blank" rel="noopener noreferrer" style={{ color: "#22d3ee" }}>
                    full setup guide
                  </a>
                  {" "}for slash commands, guild sync, and troubleshooting.
                </p>
              </div>
            )}
          </div>
        );

      case "Framework":
        return (
          <div className="space-y-3">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Framework<DocLink step="Framework" /></label>
            {Object.entries(FRAMEWORKS).map(([id, fw]) => (
              <button
                key={id}
                onClick={() => setFramework(id)}
                className="block w-full text-left rounded-xl transition-all"
                style={cardStyle(framework === id)}
              >
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{fw.name}</span>
                <span className="block text-xs mt-1" style={{ color: framework === id ? "rgba(34,211,238,0.6)" : colors.textMuted, fontWeight: 400 }}>
                  {fw.description}
                </span>
              </button>
            ))}
          </div>
        );

      case "Capabilities":
        return (
          <div className="space-y-3">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Capabilities<DocLink step="Capabilities" /></label>
            <p className="text-xs mb-3" style={{ color: "#475569", fontWeight: 400 }}>
              Select the capabilities your agent needs. These determine the risk profile and which guardrails will be auto-configured.
            </p>
            {CAPABILITIES.map((cap) => {
              const selected = capabilities.includes(cap.id);
              return (
                <button
                  key={cap.id}
                  onClick={() =>
                    setCapabilities((prev) =>
                      selected ? prev.filter((c) => c !== cap.id) : [...prev, cap.id]
                    )
                  }
                  className="block w-full text-left rounded-xl transition-all"
                  style={cardStyle(selected)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-md flex items-center justify-center"
                      style={{
                        width: "20px",
                        height: "20px",
                        flexShrink: 0,
                        background: selected ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.06)",
                        border: selected ? "1px solid rgba(34,211,238,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        color: selected ? "#22d3ee" : "transparent",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {selected ? "\u2713" : ""}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>{cap.name}</span>
                      <span className="block text-xs mt-1" style={{ color: selected ? "rgba(34,211,238,0.6)" : "#64748b", fontWeight: 400 }}>
                        {cap.description}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            <p className="text-xs mt-2" style={{ color: "#475569", fontWeight: 400 }}>
              {capabilities.length === 0 ? "No capabilities selected." : `${capabilities.length} capabilit${capabilities.length > 1 ? "ies" : "y"} selected.`}
            </p>
          </div>
        );

      case "Delivery":
        return (
          <div className="space-y-4">
            <label className="block mb-3" style={{ ...labelStyle, color: colors.textMuted }}>Delivery Method<DocLink step="Delivery" /></label>
            <div className="flex gap-3">
              <button
                onClick={() => setDelivery("github")}
                className="flex-1 text-left rounded-xl transition-all"
                style={cardStyle(delivery === "github")}
              >
                <span style={{ fontWeight: 600, fontSize: "14px" }}>GitHub Repository</span>
                <span className="block text-xs mt-1" style={{ color: delivery === "github" ? "rgba(34,211,238,0.6)" : "#64748b", fontWeight: 400, lineHeight: "1.5" }}>
                  We&apos;ll create a repo in your GitHub organization with the full project scaffold, CI/CD pipelines, and deployment config.
                </span>
              </button>
              <button
                onClick={() => setDelivery("zip")}
                className="flex-1 text-left rounded-xl transition-all"
                style={cardStyle(delivery === "zip")}
              >
                <span style={{ fontWeight: 600, fontSize: "14px" }}>Download ZIP</span>
                <span className="block text-xs mt-1" style={{ color: delivery === "zip" ? "rgba(34,211,238,0.6)" : "#64748b", fontWeight: 400, lineHeight: "1.5" }}>
                  Download a complete project scaffold. Push it to your own repo when ready.
                </span>
              </button>
            </div>

            {delivery === "github" && (
              <div className="space-y-3 mt-4">
                <div>
                  <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>GitHub Token</label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder="ghp_..."
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  />
                </div>
                <div>
                  <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>Organization / Owner</label>
                  <input
                    value={githubOrg}
                    onChange={(e) => setGithubOrg(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder="my-org"
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  />
                </div>
                <div>
                  <label className="block mb-2" style={{ ...labelStyle, color: colors.textMuted }}>Repository Name</label>
                  <input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder={name ? name.toLowerCase().replace(/\s+/g, "-") : "agent-repo"}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case "Review":
        return agentType === "ready" ? renderReadyReview() : renderCustomReview();

      default:
        return null;
    }
  };

  const renderReadyReview = () => (
    <div className="space-y-3">
      <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>Review</h3>
      <div className="text-sm space-y-1">
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Type:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Ready-to-use</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Name:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{name}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Framework:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Corail-ReAct</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Provider:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{selectedProvider?.name}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Model:</span>{" "}<span style={{ color: "#22d3ee", fontWeight: 500 }}>{modelId}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Description:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{description || "(none)"}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Prompt:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{systemPrompt.slice(0, 100)}...</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Channel:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{CHANNELS.find((c) => c.id === channel)?.name || channel}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Tools:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{tools.length || "none"}</span></p>
        <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Skills:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{skills.length > 0 ? skills.map((s) => AVAILABLE_SKILLS.find((sk) => sk.id === s)?.name || s).join(", ") : "none"}</span></p>
      </div>
      {renderResultBanner()}
    </div>
  );

  const renderCustomReview = () => {
    const fw = FRAMEWORKS[framework];
    return (
      <div className="space-y-3">
        <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>Review</h3>
        <div className="text-sm space-y-1">
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Type:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Custom Development</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Name:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{name}</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Framework:</span>{" "}<span style={{ color: "#22d3ee", fontWeight: 500 }}>{fw?.name || framework}</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Description:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{description || "(none)"}</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Channel:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{CHANNELS.find((c) => c.id === channel)?.name || channel}</span></p>
          <p>
            <span style={{ color: colors.textMuted, fontWeight: 400 }}>Capabilities:</span>{" "}
            <span style={{ color: colors.textSecondary, fontWeight: 500 }}>
              {capabilities.length > 0
                ? capabilities.map((c) => CAPABILITIES.find((cap) => cap.id === c)?.name || c).join(", ")
                : "none"}
            </span>
          </p>
          <p>
            <span style={{ color: colors.textMuted, fontWeight: 400 }}>Delivery:</span>{" "}
            <span style={{ color: colors.textSecondary, fontWeight: 500 }}>
              {delivery === "github" ? `GitHub — ${githubOrg}/${repoName}` : "Download ZIP"}
            </span>
          </p>
        </div>
        {scaffoldResult?.repo_url && (
          <div
            className="mt-4 text-sm rounded-xl"
            style={{
              padding: "12px 16px",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              color: "#4ade80",
            }}
          >
            Repository created:{" "}
            <a
              href={scaffoldResult.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#22d3ee", textDecoration: "underline" }}
            >
              {scaffoldResult.repo_url}
            </a>
          </div>
        )}
        {renderResultBanner()}
      </div>
    );
  };

  const renderResultBanner = () => {
    if (!result || scaffoldResult?.repo_url) return null;
    return (
      <div
        className="mt-4 text-sm rounded-xl"
        style={{
          padding: "12px 16px",
          background: result.startsWith("Error") ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
          border: result.startsWith("Error") ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(34,197,94,0.2)",
          color: result.startsWith("Error") ? "#f87171" : "#4ade80",
        }}
      >
        {result}
      </div>
    );
  };

  const isReview = step === lastStep;
  const createButtonText = agentType === "ready" ? "Create Agent" : "Generate Project";
  const creatingText = agentType === "ready" ? "Creating..." : "Generating...";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 style={{ color: colors.textPrimary }}>Create Agent</h2>

      {/* Step indicator */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className="flex-1 h-1 rounded-full"
            style={{
              background: i <= step
                ? "linear-gradient(90deg, #0ea5e9, #22d3ee)"
                : "rgba(255,255,255,0.06)",
            }}
          />
        ))}
      </div>
      <p className="text-sm" style={{ color: colors.textMuted, fontWeight: 400 }}>Step {step + 1}: {steps[step]}</p>

      {/* Step content */}
      <div className="reef-glass" style={{ padding: "24px", minHeight: "200px" }}>
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="btn-reef"
          style={{ opacity: step === 0 ? 0.3 : 1, cursor: step === 0 ? "default" : "pointer" }}
        >
          Back
        </button>
        {!isReview ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="btn-reef-primary"
            style={{
              padding: "10px 24px",
              fontSize: "13px",
              opacity: canProceed() ? 1 : 0.3,
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating || !!result}
            className="btn-reef-primary"
            style={{
              padding: "10px 24px",
              fontSize: "13px",
              opacity: (creating || !!result) ? 0.4 : 1,
            }}
          >
            {creating ? creatingText : createButtonText}
          </button>
        )}
      </div>
    </div>
  );
}

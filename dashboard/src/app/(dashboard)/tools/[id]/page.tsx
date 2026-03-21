"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/lib/theme";

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: string;
}

interface ToolDetail {
  id: string;
  name: string;
  type: "builtin" | "http" | "cli" | "mcp";
  category: string;
  description: string;
  enabled: boolean;
  endpoint?: string;
  method?: string;
  binary?: string;
  allowedCommands?: string[];
  secretRef?: string;
  parameters: ToolParameter[];
  agents: string[];
}

// Mock data — will come from API later
const MOCK_TOOLS: Record<string, ToolDetail> = {
  t1: { id: "t1", name: "datetime", type: "builtin", category: "utility", description: "Get the current date and time in UTC. Returns datetime, date, time, and day of week.", enabled: true, parameters: [], agents: ["Dashboard Test Agent"] },
  t2: { id: "t2", name: "calculator", type: "builtin", category: "utility", description: "Evaluate mathematical expressions safely. Supports +, -, *, /, **, (), sqrt, abs, round, pi, e.", enabled: true, parameters: [{ name: "expression", type: "string", description: "The math expression to evaluate", required: true }], agents: ["Dashboard Test Agent"] },
  t3: { id: "t3", name: "web_search", type: "builtin", category: "search", description: "Search the web for current information. Requires a search API key (Google, Bing, or Brave) to be configured.", enabled: true, parameters: [{ name: "query", type: "string", description: "The search query", required: true }], agents: [] },
  t4: { id: "t4", name: "github-issues", type: "http", category: "devops", description: "List and create GitHub issues via the GitHub REST API.", enabled: true, endpoint: "https://api.github.com/repos/{owner}/{repo}/issues", method: "GET", secretRef: "github-token", parameters: [{ name: "owner", type: "string", description: "Repository owner", required: true }, { name: "repo", type: "string", description: "Repository name", required: true }, { name: "state", type: "string", description: "Filter by state", required: false, default: "open" }], agents: [] },
  t5: { id: "t5", name: "kubectl", type: "cli", category: "infrastructure", description: "Kubernetes cluster management via kubectl CLI. Restricted to read-only commands.", enabled: false, binary: "/usr/local/bin/kubectl", allowedCommands: ["get", "describe", "logs", "top"], parameters: [{ name: "command", type: "string", description: "kubectl subcommand", required: true }, { name: "resource", type: "string", description: "Resource type (pods, services, etc.)", required: false }], agents: [] },
};

const typeBadgeColors: Record<string, { bg: string; border: string; color: string }> = {
  http: { bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.25)", color: "#22d3ee" },
  cli: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", color: "#22c55e" },
  mcp: { bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.25)", color: "#a855f7" },
  builtin: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
};

export default function ToolDetailPage() {
  const params = useParams();
  const toolId = params?.id as string;
  const tool = MOCK_TOOLS[toolId];
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const { colors } = useTheme();
  const labelStyle = { fontSize: "11px", fontWeight: 800 as const, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: colors.textMuted };

  if (!tool) {
    return (
      <div className="reef-glass" style={{ padding: "32px", textAlign: "center" }}>
        <p style={{ color: "#f87171", fontSize: 16 }}>Tool not found</p>
        <Link href="/tools" style={{ color: colors.accent, fontSize: 14 }} className="mt-2 block">Back to tools</Link>
      </div>
    );
  }

  const badge = typeBadgeColors[tool.type];

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    // Simulate tool execution
    setTimeout(() => {
      if (tool.name === "datetime") {
        setTestResult(JSON.stringify({ datetime: new Date().toISOString(), date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), day: new Date().toLocaleDateString("en", { weekday: "long" }) }, null, 2));
      } else if (tool.name === "calculator" && testInput) {
        try { setTestResult(String(eval(testInput))); } catch { setTestResult("Error: invalid expression"); } // eslint-disable-line no-eval
      } else {
        setTestResult("Tool execution placeholder — connect to agent API for live testing.");
      }
      setTesting(false);
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 style={{ color: colors.textPrimary }}>{tool.name}</h2>
            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>
              {tool.type}
            </span>
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ background: tool.enabled ? "#22c55e" : "#64748b", boxShadow: tool.enabled ? "0 0 8px rgba(34,197,94,0.5)" : "none" }} />
            <span style={{ color: colors.textMuted, fontSize: 14 }}>{tool.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <p style={{ color: colors.badgeText, fontSize: 14, marginTop: 4 }}>{tool.category}</p>
        </div>
        <Link href="/tools" style={{ color: colors.textMuted, fontSize: 14 }}>Back</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Description + Config */}
        <div className="reef-glass" style={{ padding: "24px" }}>
          <h3 style={{ color: colors.textPrimary, fontWeight: 600 }} className="mb-3">Description</h3>
          <p style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 1.7 }}>{tool.description}</p>

          {(tool.endpoint || tool.binary || tool.method) && (
            <div className="mt-6 space-y-3">
              <h3 style={{ color: colors.textPrimary, fontWeight: 600 }} className="mb-3">Configuration</h3>
              {tool.endpoint && (
                <div className="flex justify-between">
                  <span style={{ color: colors.textMuted, fontWeight: 400 }}>Endpoint</span>
                  <span className="font-mono" style={{ color: colors.textSecondary, fontWeight: 500, fontSize: 13 }}>{tool.endpoint}</span>
                </div>
              )}
              {tool.method && (
                <div className="flex justify-between">
                  <span style={{ color: colors.textMuted, fontWeight: 400 }}>Method</span>
                  <span style={{ color: "#22d3ee", fontWeight: 600 }}>{tool.method}</span>
                </div>
              )}
              {tool.binary && (
                <div className="flex justify-between">
                  <span style={{ color: colors.textMuted, fontWeight: 400 }}>Binary</span>
                  <span className="font-mono" style={{ color: colors.textSecondary, fontWeight: 500, fontSize: 13 }}>{tool.binary}</span>
                </div>
              )}
              {tool.allowedCommands && tool.allowedCommands.length > 0 && (
                <div>
                  <span style={{ color: colors.textMuted, fontWeight: 400 }}>Allowed Commands</span>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {tool.allowedCommands.map((cmd) => (
                      <span key={cmd} className="font-mono" style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", color: "#22c55e" }}>{cmd}</span>
                    ))}
                  </div>
                </div>
              )}
              {tool.secretRef && (
                <div className="flex justify-between">
                  <span style={{ color: colors.textMuted, fontWeight: 400 }}>Secret</span>
                  <span className="font-mono" style={{ color: "#f59e0b", fontWeight: 500, fontSize: 13 }}>{tool.secretRef}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parameters */}
        <div className="reef-glass" style={{ padding: "24px" }}>
          <h3 style={{ color: colors.textPrimary, fontWeight: 600 }} className="mb-3">Parameters</h3>
          {tool.parameters.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14 }}>No parameters — this tool takes no input.</p>
          ) : (
            <div className="space-y-3">
              {tool.parameters.map((p) => (
                <div key={p.name} style={{ padding: "12px 16px", borderRadius: 12, background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}` }}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: "#22d3ee", fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                    <span style={{ color: colors.textMuted, fontSize: 12 }}>{p.type}</span>
                    {p.required && <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 600 }}>required</span>}
                    {p.default && <span style={{ color: colors.textMuted, fontSize: 12 }}>default: {p.default}</span>}
                  </div>
                  <p style={{ color: colors.badgeText, fontSize: 13, marginTop: 4 }}>{p.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Used by agents */}
          <div className="mt-6">
            <h3 style={{ color: colors.textPrimary, fontWeight: 600 }} className="mb-3">Used by Agents</h3>
            {tool.agents.length === 0 ? (
              <p style={{ color: colors.textMuted, fontSize: 14 }}>Not assigned to any agent yet.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {tool.agents.map((a) => (
                  <span key={a} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.12)", color: "#22d3ee" }}>{a}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Test tool */}
        <div className="md:col-span-2 reef-glass" style={{ padding: "24px" }}>
          <h3 style={{ color: colors.textPrimary, fontWeight: 600 }} className="mb-3">Test Tool</h3>
          <div className="flex gap-3 items-end">
            {tool.parameters.length > 0 && (
              <div className="flex-1">
                <label style={labelStyle} className="block mb-2">{tool.parameters[0].name}</label>
                <input
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder={tool.parameters[0].description}
                  className="w-full rounded-xl outline-none"
                  style={{ padding: "12px 16px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary, fontSize: 14 }}
                />
              </div>
            )}
            <button onClick={runTest} disabled={testing} className="btn-reef-primary" style={{ whiteSpace: "nowrap" }}>
              {testing ? "Running..." : "Run Test"}
            </button>
          </div>
          {testResult && (
            <pre style={{
              marginTop: 16, padding: "16px 20px", borderRadius: 12,
              background: "rgba(4,14,26,0.8)", border: "1px solid rgba(34,211,238,0.1)",
              color: colors.textSecondary, fontSize: 14, lineHeight: 1.6,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
            }}>{testResult}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

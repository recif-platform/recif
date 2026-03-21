"use client";

import { useState } from "react";
import { useTheme } from "@/lib/theme";
import { inputStyle } from "@/lib/styles";

const TOOL_TYPES = ["http", "cli", "mcp"] as const;
type ToolType = (typeof TOOL_TYPES)[number];

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

interface Parameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

const STEPS = ["Basics", "Configuration", "Parameters", "Review"];

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#64748b",
};


const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)";
};

const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
};

function emptyParam(): Parameter {
  return { name: "", type: "string", description: "", required: false };
}

export default function CreateToolPage() {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);

  // Basics
  const [name, setName] = useState("");
  const [toolType, setToolType] = useState<ToolType>("http");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  // Configuration — HTTP
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<string>("GET");

  // Configuration — CLI
  const [binaryPath, setBinaryPath] = useState("");
  const [allowedCommands, setAllowedCommands] = useState("");

  // Configuration — MCP
  const [mcpEndpoint, setMcpEndpoint] = useState("");

  // Parameters
  const [parameters, setParameters] = useState<Parameter[]>([emptyParam()]);

  // Secret
  const [secretRef, setSecretRef] = useState("");

  // Submit state
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const canProceed = (): boolean => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) {
      if (toolType === "http") return endpoint.trim().length > 0;
      if (toolType === "cli") return binaryPath.trim().length > 0;
      if (toolType === "mcp") return mcpEndpoint.trim().length > 0;
    }
    return true;
  };

  const updateParameter = (index: number, field: keyof Parameter, value: string | boolean) => {
    setParameters((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeParameter = (index: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  };

  const addParameter = () => {
    setParameters((prev) => [...prev, emptyParam()]);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      // API doesn't exist yet; simulate creation
      await new Promise((r) => setTimeout(r, 800));
      window.location.href = "/tools";
    } catch {
      setResult("Error creating tool. Check that the API is running.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 style={{ color: colors.textPrimary }}>Create Tool</h2>

      {/* Step indicator */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
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
      <p className="text-sm" style={{ color: colors.textMuted, fontWeight: 400 }}>
        Step {step + 1}: {STEPS[step]}
      </p>

      {/* Step content */}
      <div className="reef-glass" style={{ padding: "24px", minHeight: "200px" }}>
        {/* ── Step 0: Basics ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block mb-2" style={labelStyle}>Tool Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl text-sm outline-none"
                style={{ padding: "12px 16px", ...inputStyle }}
                placeholder="my-tool"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <div>
              <label className="block mb-2" style={labelStyle}>Type</label>
              <div className="space-y-2">
                {TOOL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setToolType(t)}
                    className="block w-full text-left rounded-xl transition-all"
                    style={{
                      padding: "12px 16px",
                      fontWeight: 500,
                      color: toolType === t ? "#22d3ee" : "#e2e8f0",
                      background: toolType === t ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.04)",
                      border: toolType === t ? "1px solid rgba(34,211,238,0.25)" : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: toolType === t ? "inset 0 0 16px rgba(6,182,212,0.03), 0 2px 8px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block mb-2" style={labelStyle}>Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl text-sm outline-none"
                style={{ padding: "12px 16px", ...inputStyle }}
                placeholder="e.g. utility, devops, search"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <div>
              <label className="block mb-2" style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl text-sm h-20 outline-none"
                style={{ padding: "12px 16px", ...inputStyle, resize: "vertical" }}
                placeholder="What does this tool do?"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          </div>
        )}

        {/* ── Step 1: Configuration ── */}
        {step === 1 && (
          <div className="space-y-4">
            {toolType === "http" && (
              <>
                <div>
                  <label className="block mb-2" style={labelStyle}>Endpoint</label>
                  <input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder="https://api.example.com/v1/action"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label className="block mb-2" style={labelStyle}>Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle, cursor: "pointer" }}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m} style={{ background: "#0a1929", color: colors.textPrimary }}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {toolType === "cli" && (
              <>
                <div>
                  <label className="block mb-2" style={labelStyle}>Binary Path</label>
                  <input
                    value={binaryPath}
                    onChange={(e) => setBinaryPath(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none font-mono"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder="/usr/local/bin/kubectl"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label className="block mb-2" style={labelStyle}>Allowed Commands</label>
                  <input
                    value={allowedCommands}
                    onChange={(e) => setAllowedCommands(e.target.value)}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ padding: "12px 16px", ...inputStyle }}
                    placeholder="get, describe, logs (comma-separated)"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </>
            )}

            {toolType === "mcp" && (
              <div>
                <label className="block mb-2" style={labelStyle}>MCP Endpoint</label>
                <input
                  value={mcpEndpoint}
                  onChange={(e) => setMcpEndpoint(e.target.value)}
                  className="w-full rounded-xl text-sm outline-none"
                  style={{ padding: "12px 16px", ...inputStyle }}
                  placeholder="https://mcp.example.com/v1"
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            )}

            <div>
              <label className="block mb-2" style={labelStyle}>Secret Reference</label>
              <input
                value={secretRef}
                onChange={(e) => setSecretRef(e.target.value)}
                className="w-full rounded-xl text-sm outline-none"
                style={{ padding: "12px 16px", ...inputStyle }}
                placeholder="k8s-secret-name (optional)"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Parameters ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label style={labelStyle}>Parameters</label>
              <button
                onClick={addParameter}
                className="btn-reef"
                style={{ padding: "4px 12px", fontSize: "11px" }}
              >
                + Add
              </button>
            </div>

            {parameters.length === 0 && (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                No parameters defined. Click &quot;+ Add&quot; to create one.
              </p>
            )}

            {parameters.map((param, idx) => (
              <div
                key={idx}
                className="rounded-xl"
                style={{
                  padding: "16px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs" style={{ color: colors.textMuted, fontWeight: 600 }}>
                    Parameter {idx + 1}
                  </span>
                  <button
                    onClick={() => removeParameter(idx)}
                    className="text-xs transition-colors"
                    style={{ color: "#ef4444", cursor: "pointer", background: "none", border: "none" }}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block mb-1" style={{ ...labelStyle, fontSize: "10px" }}>Name</label>
                    <input
                      value={param.name}
                      onChange={(e) => updateParameter(idx, "name", e.target.value)}
                      className="w-full rounded-lg text-sm outline-none"
                      style={{ padding: "8px 12px", ...inputStyle }}
                      placeholder="param_name"
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div>
                    <label className="block mb-1" style={{ ...labelStyle, fontSize: "10px" }}>Type</label>
                    <select
                      value={param.type}
                      onChange={(e) => updateParameter(idx, "type", e.target.value)}
                      className="w-full rounded-lg text-sm outline-none"
                      style={{ padding: "8px 12px", ...inputStyle, cursor: "pointer" }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    >
                      {["string", "number", "boolean", "object", "array"].map((t) => (
                        <option key={t} value={t} style={{ background: "#0a1929", color: colors.textPrimary }}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block mb-1" style={{ ...labelStyle, fontSize: "10px" }}>Description</label>
                  <input
                    value={param.description}
                    onChange={(e) => updateParameter(idx, "description", e.target.value)}
                    className="w-full rounded-lg text-sm outline-none"
                    style={{ padding: "8px 12px", ...inputStyle }}
                    placeholder="What this parameter does"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={(e) => updateParameter(idx, "required", e.target.checked)}
                    className="rounded"
                    style={{ accentColor: "#22d3ee" }}
                  />
                  <span className="text-xs" style={{ color: colors.badgeText }}>Required</span>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <div className="space-y-3">
            <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>Review</h3>
            <div className="text-sm space-y-1">
              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Name:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{name}</span></p>
              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Type:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{toolType.toUpperCase()}</span></p>
              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Category:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{category || "(none)"}</span></p>
              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Description:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{description || "(none)"}</span></p>

              {toolType === "http" && (
                <>
                  <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Endpoint:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{method} {endpoint}</span></p>
                </>
              )}
              {toolType === "cli" && (
                <>
                  <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Binary:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{binaryPath}</span></p>
                  <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Commands:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{allowedCommands || "(all)"}</span></p>
                </>
              )}
              {toolType === "mcp" && (
                <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>MCP Endpoint:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{mcpEndpoint}</span></p>
              )}

              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Secret:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{secretRef || "(none)"}</span></p>
              <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Parameters:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>{parameters.filter((p) => p.name.trim()).length || "none"}</span></p>
            </div>
            {result && (
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
            )}
          </div>
        )}
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
        {step < 3 ? (
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
            {creating ? "Creating..." : "Create Tool"}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchIntegrations,
  fetchIntegrationTypes,
  createIntegration,
  deleteIntegration,
  testIntegration,
  type Integration,
  type IntegrationType,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";

const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  connected: { color: "#22c55e", glow: "rgba(34,197,94,0.5)", label: "Connected" },
  disconnected: { color: "#64748b", glow: "rgba(100,116,139,0.3)", label: "Disconnected" },
  error: { color: "#f87171", glow: "rgba(248,113,113,0.5)", label: "Error" },
};

const iconMap: Record<string, string> = {
  github: "GH",
  jira: "JI",
  jenkins: "JK",
  slack: "SL",
  aws: "AW",
  gcp: "GC",
  datadog: "DD",
  terraform: "TF",
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [types, setTypes] = useState<IntegrationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<IntegrationType | null>(null);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { status: string; message: string }>>({});
  const { colors, theme } = useTheme();

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
    marginBottom: 6,
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.textPrimary,
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 14,
    outline: "none",
  };

  const load = useCallback(async () => {
    try {
      const [intgs, tps] = await Promise.all([fetchIntegrations(), fetchIntegrationTypes()]);
      setIntegrations(intgs);
      setTypes(tps);
    } catch {
      /* ignore load errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const typeMap = types.reduce<Record<string, IntegrationType>>((acc, t) => {
    acc[t.type] = t;
    return acc;
  }, {});

  const openModal = () => {
    setShowModal(true);
    setStep(1);
    setSelectedType(null);
    setName("");
    setConfig({});
    setCredentials({});
    setError("");
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const selectType = (t: IntegrationType) => {
    setSelectedType(t);
    setName(`My ${t.label}`);
    setConfig({});
    setCredentials({});
    setError("");
    setStep(2);
  };

  const handleCreate = async () => {
    if (!selectedType || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createIntegration({ name, type: selectedType.type, config, credentials });
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteIntegration(id);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* ignore */
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await testIntegration(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      await load();
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { status: "error", message: "Test failed" } }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 200, color: colors.textMuted }}>
        Loading integrations...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Integrations</h2>
        <button onClick={openModal} className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
          + Add Integration
        </button>
      </div>

      {/* Empty state */}
      {integrations.length === 0 && (
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>
            No integrations configured
          </p>
          <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
            Connect external services to expose tools to your agents.
          </p>
          <button onClick={openModal} className="btn-reef-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
            Add Integration
          </button>
        </div>
      )}

      {/* Integration cards grid */}
      {integrations.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((intg) => {
            const st = statusConfig[intg.status] || statusConfig.disconnected;
            const meta = typeMap[intg.type];
            const tools = meta?.exposed_tools || [];
            const testResult = testResults[intg.id];

            return (
              <div
                key={intg.id}
                className="reef-glass transition-all"
                style={{ padding: "24px" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = colors.cardHoverBorder;
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = colors.cardBorder;
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                {/* Header: Icon + Name + Status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center justify-center rounded-lg text-xs font-bold"
                      style={{
                        width: 36,
                        height: 36,
                        background: colors.accentBg,
                        border: `1px solid ${colors.accentBorder}`,
                        color: colors.accent,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {iconMap[intg.type] || "??"}
                    </span>
                    <div>
                      <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 15 }}>{intg.name}</h3>
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        {meta?.label || intg.type}
                      </span>
                    </div>
                  </div>
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{
                      background: st.color,
                      boxShadow: `0 0 8px ${st.glow}`,
                    }}
                    title={st.label}
                  />
                </div>

                {/* Description */}
                {meta && (
                  <p className="text-sm mb-3" style={{ color: colors.badgeText, fontWeight: 400 }}>
                    {meta.description}
                  </p>
                )}

                {/* Exposed tools */}
                {tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tools.map((tool) => (
                      <span
                        key={tool}
                        className="text-xs rounded-md"
                        style={{
                          padding: "2px 8px",
                          fontWeight: 500,
                          color: "#a855f7",
                          background: "rgba(168,85,247,0.1)",
                          border: "1px solid rgba(168,85,247,0.25)",
                          fontFamily: "monospace",
                          fontSize: 11,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tool count badge */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-xs"
                    style={{
                      padding: "2px 8px",
                      fontWeight: 500,
                      color: colors.badgeText,
                      background: colors.badgeBg,
                      borderRadius: "6px",
                      border: `1px solid ${colors.badgeBorder}`,
                    }}
                  >
                    {tools.length} {tools.length === 1 ? "tool" : "tools"}
                  </span>
                  <span className="text-xs" style={{ color: st.color, fontWeight: 500 }}>
                    {st.label}
                  </span>
                </div>

                {/* Test result feedback */}
                {testResult && (
                  <p
                    className="text-xs mb-3"
                    style={{ color: testResult.status === "connected" ? "#22c55e" : "#f87171" }}
                  >
                    {testResult.message}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(intg.id)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: colors.accentBg,
                      border: `1px solid ${colors.accentBorder}`,
                      color: colors.accent,
                      cursor: "pointer",
                    }}
                  >
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(intg.id)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: "rgba(248,113,113,0.08)",
                      border: "1px solid rgba(248,113,113,0.15)",
                      color: "#f87171",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Add Integration Modal ---- */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: colors.overlayBg, backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="reef-glass"
            style={{
              width: "100%",
              maxWidth: step === 1 ? 720 : 520,
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "28px",
            }}
          >
            {/* Step 1: Pick type */}
            {step === 1 && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>Choose Integration Type</h3>
                  <button onClick={closeModal} style={{ color: colors.textMuted, cursor: "pointer", background: "none", border: "none", fontSize: 18 }}>
                    x
                  </button>
                </div>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {types.map((t) => (
                    <button
                      key={t.type}
                      onClick={() => selectType(t)}
                      className="reef-glass text-left transition-all"
                      style={{
                        padding: "16px",
                        cursor: "pointer",
                        border: `1px solid ${colors.cardBorder}`,
                        background: colors.badgeBg,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = colors.cardHoverBorder;
                        (e.currentTarget as HTMLButtonElement).style.background = colors.accentBg;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = colors.cardBorder;
                        (e.currentTarget as HTMLButtonElement).style.background = colors.badgeBg;
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-lg text-sm font-bold mb-2"
                        style={{
                          width: 40,
                          height: 40,
                          background: colors.accentBg,
                          border: `1px solid ${colors.accentBorder}`,
                          color: colors.accent,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {iconMap[t.type] || "??"}
                      </span>
                      <p style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{t.label}</p>
                      <p style={{ color: colors.textMuted, fontSize: 11, lineHeight: 1.4 }}>{t.description}</p>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 2: Configure */}
            {step === 2 && selectedType && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(1)}
                      style={{ color: colors.textMuted, cursor: "pointer", background: "none", border: "none", fontSize: 14 }}
                    >
                      Back
                    </button>
                    <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>
                      Configure {selectedType.label}
                    </h3>
                  </div>
                  <button onClick={closeModal} style={{ color: colors.textMuted, cursor: "pointer", background: "none", border: "none", fontSize: 18 }}>
                    x
                  </button>
                </div>

                <div className="space-y-5">
                  {/* Name */}
                  <div>
                    <label style={labelStyle}>Integration Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`e.g. My ${selectedType.label}`}
                      style={inputStyle}
                    />
                  </div>

                  {/* Config fields */}
                  {selectedType.config_fields.length > 0 && (
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: 10,
                        background: colors.accentBg,
                        border: `1px solid ${colors.accentBorder}`,
                      }}
                    >
                      <p style={{ ...labelStyle, marginBottom: 12 }}>Configuration</p>
                      <div className="space-y-4">
                        {selectedType.config_fields.map((field) => (
                          <div key={field.key}>
                            <label style={labelStyle}>
                              {field.label}
                              {field.required && <span style={{ color: "#f87171" }}> *</span>}
                            </label>
                            <input
                              type={field.type === "url" ? "url" : "text"}
                              value={config[field.key] || ""}
                              onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              style={inputStyle}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Credential fields */}
                  {selectedType.credential_fields.length > 0 && (
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: 10,
                        background: "rgba(168,85,247,0.03)",
                        border: "1px solid rgba(168,85,247,0.1)",
                      }}
                    >
                      <p style={{ ...labelStyle, marginBottom: 12 }}>Credentials</p>
                      <div className="space-y-4">
                        {selectedType.credential_fields.map((field) => (
                          <div key={field.key}>
                            <label style={labelStyle}>
                              {field.label}
                              {field.required && <span style={{ color: "#f87171" }}> *</span>}
                            </label>
                            <input
                              type={field.type === "password" ? "password" : "text"}
                              value={credentials[field.key] || ""}
                              onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              style={inputStyle}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Exposed tools preview */}
                  {selectedType.exposed_tools.length > 0 && (
                    <div>
                      <p style={labelStyle}>Exposed Tools</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedType.exposed_tools.map((tool) => (
                          <span
                            key={tool}
                            className="text-xs rounded-md"
                            style={{
                              padding: "2px 8px",
                              fontWeight: 500,
                              color: "#a855f7",
                              background: "rgba(168,85,247,0.1)",
                              border: "1px solid rgba(168,85,247,0.25)",
                              fontFamily: "monospace",
                              fontSize: 11,
                            }}
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && <p style={{ color: "#f87171", fontSize: 14 }}>{error}</p>}

                  <button
                    onClick={handleCreate}
                    disabled={saving || !name.trim()}
                    className="btn-reef-primary"
                    style={{ width: "100%" }}
                  >
                    {saving ? "Creating..." : "Create Integration"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

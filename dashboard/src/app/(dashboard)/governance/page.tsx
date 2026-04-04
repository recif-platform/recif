"use client";

import { useEffect, useState } from "react";
import {
  fetchScorecards,
  fetchPolicies,
  createPolicy,
  deletePolicy,
  Scorecard,
  ScoreDimension,
  GuardrailPolicy,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";

type Tab = "scorecards" | "policies";

const scoreColor = (score: number) => {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
};

const scoreGlow = (score: number) => {
  if (score >= 80) return "rgba(34,197,94,0.4)";
  if (score >= 60) return "rgba(234,179,8,0.4)";
  return "rgba(239,68,68,0.4)";
};

const gradeColor = (grade: string) => {
  const map: Record<string, string> = { A: "#22c55e", B: "#4ade80", C: "#eab308", D: "#f97316", F: "#ef4444" };
  return map[grade] || "#64748b";
};

const severityConfig: Record<string, { color: string; bg: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  warning: { color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  info: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
};

const statusDot: Record<string, string> = {
  ok: "#22c55e",
  warning: "#eab308",
  critical: "#ef4444",
};

function DimensionBar({ label, dim }: { label: string; dim: ScoreDimension }) {
  const { colors } = useTheme();
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-xs w-20 shrink-0" style={{ color: colors.badgeText, fontWeight: 500 }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full" style={{ background: colors.divider }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${Math.min(dim.score, 100)}%`,
            background: scoreColor(dim.score),
            boxShadow: `0 0 6px ${scoreGlow(dim.score)}`,
          }}
        />
      </div>
      <span
        className="text-xs font-bold w-6 text-right"
        style={{ color: gradeColor(dim.grade) }}
      >
        {dim.grade}
      </span>
    </div>
  );
}

function ScorecardCard({
  sc,
  onSelect,
}: {
  sc: Scorecard;
  onSelect: (sc: Scorecard) => void;
}) {
  const { colors } = useTheme();
  return (
    <div
      className="reef-glass cursor-pointer transition-all"
      style={{ padding: "24px" }}
      onClick={() => onSelect(sc)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.cardHoverBorder;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: "15px" }}>{sc.agent_name}</h3>
        <div className="flex items-center gap-2">
          <span
            className="text-2xl font-black"
            style={{ color: scoreColor(sc.overall), textShadow: `0 0 12px ${scoreGlow(sc.overall)}` }}
          >
            {Math.round(sc.overall)}
          </span>
        </div>
      </div>

      <DimensionBar label="Quality" dim={sc.quality} />
      <DimensionBar label="Safety" dim={sc.safety} />
      <DimensionBar label="Cost" dim={sc.cost} />
      <DimensionBar label="Compliance" dim={sc.compliance} />

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {new Date(sc.updated_at).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function ScorecardDetail({ sc, onBack }: { sc: Scorecard; onBack: () => void }) {
  const { colors } = useTheme();
  const dimensions: { label: string; dim: ScoreDimension }[] = [
    { label: "Quality", dim: sc.quality },
    { label: "Safety", dim: sc.safety },
    { label: "Cost", dim: sc.cost },
    { label: "Compliance", dim: sc.compliance },
  ];

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm"
        style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer" }}
      >
        &larr; Back to scorecards
      </button>

      <div className="reef-glass" style={{ padding: "24px" }}>
        <div className="flex items-center gap-4 mb-6">
          <span
            className="text-4xl font-black"
            style={{ color: scoreColor(sc.overall), textShadow: `0 0 16px ${scoreGlow(sc.overall)}` }}
          >
            {Math.round(sc.overall)}
          </span>
          <div>
            <h2 style={{ color: colors.textPrimary, fontWeight: 700 }}>{sc.agent_name}</h2>
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Agent ID: {sc.agent_id}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {dimensions.map(({ label, dim }) => (
            <div
              key={label}
              className="rounded-xl"
              style={{
                padding: "16px",
                background: colors.badgeBg,
                border: `1px solid ${colors.badgeBorder}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{label}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: scoreColor(dim.score), fontWeight: 700 }}>{dim.score}</span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ color: gradeColor(dim.grade), background: colors.badgeBg }}
                  >
                    {dim.grade}
                  </span>
                </div>
              </div>

              {dim.metrics.map((m) => (
                <div key={m.name} className="flex items-center justify-between py-1.5" style={{ borderTop: `1px solid ${colors.divider}` }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-2 w-2 rounded-full"
                      style={{ background: statusDot[m.status] || "#64748b" }}
                    />
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      {m.name.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: colors.textPrimary }}>
                      {m.value}
                      {m.unit === "percent" ? "%" : m.unit === "ms" ? "ms" : m.unit === "usd" ? "$" : ""}
                    </span>
                    <span className="text-xs" style={{ color: colors.textMuted }}>
                      / {m.threshold}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PoliciesTab() {
  const { colors } = useTheme();
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSeverity, setFormSeverity] = useState("warning");
  const [formRuleType, setFormRuleType] = useState("max_tokens");
  const [formRuleOp, setFormRuleOp] = useState("lt");
  const [formRuleValue, setFormRuleValue] = useState("");

  const policyInputStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: colors.textPrimary,
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: "8px",
    outline: "none",
  };

  useEffect(() => {
    fetchPolicies()
      .then(setPolicies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!formName || !formRuleValue) return;
    const p = await createPolicy({
      name: formName,
      description: formDesc,
      severity: formSeverity,
      enabled: true,
      rules: [{ type: formRuleType, operator: formRuleOp, value: formRuleValue }],
    });
    setPolicies((prev) => [...prev, p]);
    setShowForm(false);
    setFormName("");
    setFormDesc("");
    setFormRuleValue("");
  };

  const handleDelete = async (id: string) => {
    await deletePolicy(id);
    setPolicies((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return <p style={{ color: colors.textMuted }}>Loading policies...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 style={{ color: colors.textPrimary, fontWeight: 600 }}>Guardrail Policies</h3>
        <button
          className="btn-reef-primary"
          style={{ padding: "6px 16px", fontSize: "13px" }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Policy"}
        </button>
      </div>

      {showForm && (
        <div className="reef-glass" style={{ padding: "20px" }}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Policy name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              style={policyInputStyle}
            />
            <select value={formSeverity} onChange={(e) => setFormSeverity(e.target.value)} style={policyInputStyle}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <input
              placeholder="Description"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              style={{ ...policyInputStyle, gridColumn: "1 / -1" }}
            />
            <select value={formRuleType} onChange={(e) => setFormRuleType(e.target.value)} style={policyInputStyle}>
              <option value="max_tokens">Max Tokens</option>
              <option value="max_latency">Max Latency</option>
              <option value="blocked_topics">Blocked Topics</option>
              <option value="required_sources">Required Sources</option>
              <option value="max_cost_per_day">Max Cost/Day</option>
            </select>
            <select value={formRuleOp} onChange={(e) => setFormRuleOp(e.target.value)} style={policyInputStyle}>
              <option value="lt">Less than</option>
              <option value="gt">Greater than</option>
              <option value="eq">Equals</option>
              <option value="contains">Contains</option>
            </select>
            <input
              placeholder="Value"
              value={formRuleValue}
              onChange={(e) => setFormRuleValue(e.target.value)}
              style={policyInputStyle}
            />
            <button
              className="btn-reef-primary"
              style={{ padding: "8px 16px", fontSize: "13px" }}
              onClick={handleCreate}
            >
              Create Policy
            </button>
          </div>
        </div>
      )}

      {policies.length === 0 ? (
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p style={{ color: colors.textMuted }}>No policies configured yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((p) => {
            const sev = severityConfig[p.severity] || severityConfig.info;
            return (
              <div
                key={p.id}
                className="reef-glass flex items-center justify-between"
                style={{ padding: "16px 20px" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ background: p.enabled ? sev.color : colors.textMuted }}
                  />
                  <div>
                    <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: "14px" }}>{p.name}</span>
                    <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {p.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs rounded-md px-2 py-0.5"
                    style={{
                      color: sev.color,
                      background: sev.bg,
                      border: `1px solid ${sev.color}33`,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {p.severity}
                  </span>
                  {p.rules.map((rule, i) => (
                    <span
                      key={i}
                      className="text-xs font-mono"
                      style={{
                        color: colors.badgeText,
                        padding: "2px 8px",
                        background: colors.badgeBg,
                        borderRadius: "6px",
                        border: `1px solid ${colors.badgeBorder}`,
                      }}
                    >
                      {rule.type} {rule.operator} {rule.value}
                    </span>
                  ))}
                  <button
                    onClick={() => handleDelete(p.id)}
                    style={{
                      color: "#ef4444",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
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
    </div>
  );
}

export default function GovernancePage() {
  const { colors } = useTheme();
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("scorecards");
  const [selected, setSelected] = useState<Scorecard | null>(null);

  useEffect(() => {
    fetchScorecards()
      .then(setScorecards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Governance</h2>
        <div className="flex gap-1" style={{ background: colors.badgeBg, borderRadius: "10px", padding: "3px" }}>
          {(["scorecards", "policies"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setSelected(null);
              }}
              style={{
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? colors.accent : colors.textMuted,
                background: tab === t ? colors.accentBg : "transparent",
                border: tab === t ? `1px solid ${colors.accentBorder}` : "1px solid transparent",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === "scorecards" && (
        <>
          {loading ? (
            <p style={{ color: colors.textMuted }}>Loading scorecards...</p>
          ) : selected ? (
            <ScorecardDetail sc={selected} onBack={() => setSelected(null)} />
          ) : scorecards.length === 0 ? (
            <div className="reef-glass text-center" style={{ padding: "32px" }}>
              <p className="text-lg mb-2" style={{ color: colors.textPrimary, fontWeight: 500 }}>
                No agents to score
              </p>
              <p className="text-sm" style={{ color: colors.textMuted }}>
                Register agents to see their governance scorecards.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {scorecards.map((sc) => (
                <ScorecardCard key={sc.agent_id} sc={sc} onSelect={setSelected} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "policies" && <PoliciesTab />}
    </div>
  );
}

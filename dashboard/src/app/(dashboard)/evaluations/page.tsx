"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import { inputStyle } from "@/lib/styles";
import {
  fetchAgents,
  fetchEvalRuns,
  triggerEval,
  fetchDatasets,
  type Agent,
  type EvalRun,
  type EvalDataset,
} from "@/lib/api";

function scoreBadge(score: number): React.CSSProperties {
  const bg = score >= 0.8 ? "rgba(34,197,94,0.1)" : score >= 0.6 ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)";
  const border = score >= 0.8 ? "rgba(34,197,94,0.3)" : score >= 0.6 ? "rgba(234,179,8,0.3)" : "rgba(239,68,68,0.3)";
  const color = score >= 0.8 ? "#4ade80" : score >= 0.6 ? "#facc15" : "#f87171";
  return { background: bg, border: `1px solid ${border}`, color, padding: "2px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 600 };
}

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; border: string; color: string }> = {
    completed: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", color: "#4ade80" },
    running: { bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.3)", color: "#facc15" },
    failed: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", color: "#f87171" },
  };
  const s = map[status] || map.failed;
  return { background: s.bg, border: `1px solid ${s.border}`, color: s.color, padding: "2px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const };
}

function avgScore(scores: Record<string, number>): number {
  const vals = Object.values(scores);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

export default function EvaluationsPage() {
  const { colors } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {});
  }, []);

  const loadRuns = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [r, d] = await Promise.all([fetchEvalRuns(agentId), fetchDatasets(agentId)]);
      setRuns(r);
      setDatasets(d);
    } catch {
      setRuns([]);
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgent) loadRuns(selectedAgent);
  }, [selectedAgent, loadRuns]);

  const handleTrigger = async () => {
    if (!selectedAgent) return;
    setTriggering(true);
    try {
      const dsName = datasets.length > 0 ? datasets[0].name : "golden-example";
      await triggerEval(selectedAgent, dsName);
      await loadRuns(selectedAgent);
    } catch {
      // API error
    } finally {
      setTriggering(false);
    }
  };

  const toggleCompare = (runId: string) => {
    if (compareA === runId) { setCompareA(null); return; }
    if (compareB === runId) { setCompareB(null); return; }
    if (!compareA) { setCompareA(runId); return; }
    if (!compareB) { setCompareB(runId); return; }
    setCompareA(runId);
    setCompareB(null);
  };

  const runA = runs.find(r => r.id === compareA);
  const runB = runs.find(r => r.id === compareB);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Evaluations</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedAgent}
            onChange={(e) => { setSelectedAgent(e.target.value); setExpandedRun(null); setCompareA(null); setCompareB(null); }}
            style={inputStyle}
          >
            <option value="">Select an agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.slug || a.id}>{a.name}</option>
            ))}
          </select>
          <button
            onClick={handleTrigger}
            disabled={!selectedAgent || triggering}
            className="btn-reef-primary"
            style={{ padding: "10px 20px", fontSize: "13px", opacity: (!selectedAgent || triggering) ? 0.4 : 1 }}
          >
            {triggering ? "Running..." : "Run Evaluation"}
          </button>
        </div>
      </div>

      {/* Compare view */}
      {compareA && compareB && runA && runB && (
        <div className="reef-glass" style={{ padding: "20px" }}>
          <h3 className="text-sm mb-4" style={{ color: colors.textPrimary, fontWeight: 700 }}>
            Champion vs Challenger
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <span style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", padding: "3px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 700 }}>
                CHAMPION
              </span>
              <p className="text-xs mt-2" style={{ color: colors.textMuted }}>v{runA.agent_version} &middot; {runA.dataset_name}</p>
            </div>
            <div className="text-center">
              <span style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", padding: "3px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 700 }}>
                CHALLENGER
              </span>
              <p className="text-xs mt-2" style={{ color: colors.textMuted }}>v{runB.agent_version} &middot; {runB.dataset_name}</p>
            </div>
          </div>
          {/* Score bars */}
          {(() => {
            const allKeys = [...new Set([...Object.keys(runA.aggregate_scores), ...Object.keys(runB.aggregate_scores)])];
            return allKeys.map((key) => {
              const a = runA.aggregate_scores[key] ?? 0;
              const b = runB.aggregate_scores[key] ?? 0;
              const winner = a > b ? "a" : b > a ? "b" : "tie";
              return (
                <div key={key} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: colors.textMuted, fontWeight: 500 }}>{key.replace(/_/g, " ")}</span>
                    <span style={{ color: colors.textMuted }}>{(a * 100).toFixed(0)}% vs {(b * 100).toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ width: `${a * 100}%`, height: "100%", borderRadius: "3px", background: winner === "a" ? "#22d3ee" : "rgba(34,211,238,0.4)" }} />
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ width: `${b * 100}%`, height: "100%", borderRadius: "3px", background: winner === "b" ? "#fb923c" : "rgba(251,146,60,0.4)" }} />
                    </div>
                  </div>
                </div>
              );
            });
          })()}
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-center">
              <span className="text-2xl font-bold" style={{ color: "#22d3ee" }}>{(avgScore(runA.aggregate_scores) * 100).toFixed(0)}%</span>
              <p className="text-xs" style={{ color: colors.textMuted }}>avg score</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold" style={{ color: "#fb923c" }}>{(avgScore(runB.aggregate_scores) * 100).toFixed(0)}%</span>
              <p className="text-xs" style={{ color: colors.textMuted }}>avg score</p>
            </div>
          </div>
        </div>
      )}

      {/* Runs table */}
      {!selectedAgent ? (
        <div className="reef-glass text-center" style={{ padding: "48px" }}>
          <p className="text-lg mb-2" style={{ color: colors.textPrimary, fontWeight: 500 }}>Select an agent to view evaluations</p>
          <p className="text-sm" style={{ color: colors.textMuted }}>
            Evaluations use LLM-as-judge (Gemini 2.5 Pro) to score agent responses against a golden dataset.
          </p>
        </div>
      ) : loading ? (
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p style={{ color: colors.textMuted }}>Loading evaluations...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="reef-glass text-center" style={{ padding: "48px" }}>
          <p className="text-lg mb-2" style={{ color: colors.textPrimary, fontWeight: 500 }}>No evaluations yet</p>
          <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
            Click &quot;Run Evaluation&quot; to score this agent against the golden dataset using LLM-as-judge.
          </p>
        </div>
      ) : (
        <div className="reef-glass" style={{ padding: "0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["", "Version", "Dataset", "Status", "Avg Score", "Cases", "Provider", "Date"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.textMuted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const avg = avgScore(run.aggregate_scores);
                const isExpanded = expandedRun === run.id;
                const isSelected = compareA === run.id || compareB === run.id;
                return (
                  <Fragment key={run.id}>
                    <tr
                      onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isExpanded ? "rgba(34,211,238,0.03)" : "transparent" }}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCompare(run.id); }}
                          style={{
                            width: "18px", height: "18px", borderRadius: "4px", border: isSelected ? "1px solid rgba(34,211,238,0.5)" : "1px solid rgba(255,255,255,0.1)",
                            background: isSelected ? "rgba(34,211,238,0.2)" : "transparent", color: isSelected ? "#22d3ee" : "transparent", fontSize: "11px", fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                          }}
                        >
                          {isSelected ? "\u2713" : ""}
                        </button>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#22d3ee", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>v{run.agent_version}</td>
                      <td style={{ padding: "10px 16px", color: colors.textSecondary, fontSize: "13px" }}>{run.dataset_name}</td>
                      <td style={{ padding: "10px 16px" }}><span style={statusBadge(run.status)}>{run.status}</span></td>
                      <td style={{ padding: "10px 16px" }}><span style={scoreBadge(avg)}>{(avg * 100).toFixed(0)}%</span></td>
                      <td style={{ padding: "10px 16px", color: colors.textMuted, fontSize: "13px" }}>{run.passed_cases}/{run.total_cases}</td>
                      <td style={{ padding: "10px 16px", color: colors.textMuted, fontSize: "12px" }}>{run.provider || "mlflow"}</td>
                      <td style={{ padding: "10px 16px", color: colors.textMuted, fontSize: "12px" }}>{new Date(run.started_at).toLocaleDateString()}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${run.id}-detail`}>
                        <td colSpan={8} style={{ padding: "0 16px 16px 16px", background: "rgba(34,211,238,0.02)" }}>
                          <div className="grid grid-cols-3 gap-3 mt-2">
                            {Object.entries(run.aggregate_scores).map(([key, val]) => (
                              <div key={key} className="rounded-lg" style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <p className="text-xs mb-1" style={{ color: colors.textMuted, fontWeight: 500 }}>{key.replace(/_/g, " ")}</p>
                                <div className="flex items-center gap-2">
                                  <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}>
                                    <div style={{ width: `${val * 100}%`, height: "100%", borderRadius: "2px", background: val >= 0.8 ? "#4ade80" : val >= 0.6 ? "#facc15" : "#f87171" }} />
                                  </div>
                                  <span className="text-xs font-mono" style={{ color: val >= 0.8 ? "#4ade80" : val >= 0.6 ? "#facc15" : "#f87171", fontWeight: 600 }}>
                                    {(val * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {(compareA || compareB) && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(34,211,238,0.03)" }}>
              <p className="text-xs" style={{ color: colors.textMuted }}>
                {compareA && compareB ? "Comparing 2 runs above." : "Select 2 runs to compare Champion vs Challenger."}
                {" "}Click checkboxes to toggle.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

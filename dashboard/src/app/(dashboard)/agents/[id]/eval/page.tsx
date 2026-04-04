"use client";

import { useParams } from "next/navigation";
import { useTheme } from "@/lib/theme";

const mockResults = {
  overall_score: 82.5,
  status: "completed",
  risk_profile: "MEDIUM",
  threshold: 75,
  gate_decision: "pass",
  scenarios: [
    { id: "sc_1", name: "Greeting", pass: true, score: 95, actual: "Hello!", expected: "Hello" },
    { id: "sc_2", name: "Math", pass: true, score: 85, actual: "42", expected: "42" },
    { id: "sc_3", name: "Complex", pass: false, score: 60, actual: "I'm not sure", expected: "The answer is..." },
  ],
};

const scoreColor = (score: number, threshold: number): string => {
  if (score >= threshold + 10) return "#22c55e";
  if (score >= threshold) return "#eab308";
  return "#ef4444";
};

const scoreGlow = (score: number, threshold: number): string => {
  if (score >= threshold + 10) return "rgba(34,197,94,0.5)";
  if (score >= threshold) return "rgba(234,179,8,0.5)";
  return "rgba(239,68,68,0.5)";
};

export default function EvalPage() {
  const params = useParams();
  const agentId = params?.id as string;
  const r = mockResults;
  const { colors } = useTheme();

  const overallColor = scoreColor(r.overall_score, r.threshold);
  const gateColor = r.gate_decision === "pass" ? "#22c55e" : "#ef4444";
  const gateGlow = r.gate_decision === "pass" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";

  return (
    <div className="space-y-6">
      <h2 style={{ color: colors.textPrimary }}>Evaluation — {agentId}</h2>

      {/* Score Card */}
      <div className="reef-glass" style={{ padding: "24px" }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>Overall Score</p>
            <p style={{ fontSize: "36px", fontWeight: 700, color: overallColor, textShadow: `0 0 20px ${scoreGlow(r.overall_score, r.threshold)}` }}>
              {r.overall_score}
            </p>
          </div>
          <div className="text-right">
            <p style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>Quality Gate</p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: gateColor, boxShadow: `0 0 8px ${gateGlow}` }}
              />
              <p style={{ fontSize: "18px", fontWeight: 700, color: gateColor }}>
                {r.gate_decision.toUpperCase()}
              </p>
            </div>
            <p className="text-xs" style={{ color: colors.textMuted, fontWeight: 400, marginTop: "4px" }}>
              {r.risk_profile} (min {r.threshold})
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Results */}
      <div className="space-y-3">
        <h3 style={{ color: colors.textPrimary, fontWeight: 700 }}>Scenarios</h3>
        {r.scenarios.map((s) => {
          const sColor = s.pass ? "#22c55e" : "#ef4444";
          const sGlow = s.pass ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
          return (
            <div key={s.id} className="reef-glass" style={{ padding: "16px 20px" }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono" style={{ color: sColor, fontWeight: 500 }}>
                    {s.score}
                  </span>
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ background: sColor, boxShadow: `0 0 8px ${sGlow}` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Expected</p>
                  <p className="font-mono text-xs" style={{ color: colors.textSecondary, fontWeight: 400 }}>{s.expected}</p>
                </div>
                <div>
                  <p style={{ color: colors.textMuted, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Actual</p>
                  <p className="font-mono text-xs" style={{ color: colors.textSecondary, fontWeight: 400 }}>{s.actual}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

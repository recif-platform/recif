"use client";

import { useTheme } from "@/lib/theme";

export default function EvaluationsPage() {
  const { colors } = useTheme();
  return (
    <div className="space-y-6">
      <h2 style={{ color: colors.textPrimary }}>Evaluations</h2>

      <div className="reef-glass text-center" style={{ padding: "32px" }}>
        <p className="text-lg mb-2" style={{ color: colors.textPrimary, fontWeight: 500 }}>No evaluations yet</p>
        <p className="text-sm mb-4" style={{ color: colors.textMuted, fontWeight: 400 }}>
          Create an agent first, then run an evaluation against a Golden Dataset.
        </p>
        <div className="text-sm space-y-1" style={{ color: colors.textMuted, fontWeight: 400 }}>
          <p>1. Create an agent from the <a href="/agents/new" style={{ color: colors.accent }}>wizard</a></p>
          <p>2. Create a Golden Dataset with test scenarios</p>
          <p>
            3. Run evaluation via CLI:{" "}
            <code
              className="text-sm font-mono"
              style={{
                padding: "2px 8px",
                borderRadius: "8px",
                background: colors.badgeBg,
                border: `1px solid ${colors.accentBorder}`,
                color: colors.accent,
              }}
            >
              recif eval my-agent
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

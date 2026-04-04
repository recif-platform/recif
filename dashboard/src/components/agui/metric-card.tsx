"use client";

import { registerComponent } from "./registry";

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  unit?: string;
}

function MetricCard({ label, value, change, unit }: MetricCardProps) {
  const isPositive = change != null && change > 0;
  const isNegative = change != null && change < 0;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 6,
        padding: "20px 24px",
        borderRadius: 14,
        background:
          "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
        minWidth: 140,
        margin: "4px 0",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#f1f5f9",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#64748b",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {change != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            fontWeight: 600,
            color: isPositive
              ? "#4ade80"
              : isNegative
                ? "#f87171"
                : "#64748b",
          }}
        >
          <span style={{ fontSize: 12 }}>
            {isPositive ? "\u25B2" : isNegative ? "\u25BC" : "\u2014"}
          </span>
          <span>
            {isPositive ? "+" : ""}
            {change}%
          </span>
        </div>
      )}
    </div>
  );
}

registerComponent("metric-card", MetricCard);

export { MetricCard };

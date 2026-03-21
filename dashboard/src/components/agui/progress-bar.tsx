"use client";

import { registerComponent } from "./registry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function ProgressBar({
  value,
  max = 100,
  label,
  color = "#22d3ee",
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 20px",
        borderRadius: 14,
        background:
          "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
        margin: "8px 0",
      }}
    >
      {label && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#94a3b8",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f1f5f9",
            }}
          >
            {value}/{max}
          </span>
        </div>
      )}
      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 6,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${pct}%`,
            borderRadius: 6,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            boxShadow: `0 0 12px ${color}66, 0 0 4px ${color}44`,
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
}

registerComponent("progress-bar", ProgressBar);

export { ProgressBar };

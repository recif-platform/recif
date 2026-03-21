"use client";

import { registerComponent } from "./registry";
import { MetricCard } from "./metric-card";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Stat {
  label: string;
  value: string | number;
  change?: number;
  unit?: string;
}

interface StatGridProps {
  stats: Stat[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function StatGrid({ stats }: StatGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        margin: "8px 0",
      }}
    >
      {stats.map((stat, i) => (
        <div key={i} style={{ display: "flex" }}>
          <MetricCard
            label={stat.label}
            value={stat.value}
            change={stat.change}
            unit={stat.unit}
          />
        </div>
      ))}
    </div>
  );
}

registerComponent("stat-grid", StatGrid);

export { StatGrid };

"use client";

import { useEffect, useState } from "react";
import {
  fetchRadarOverview,
  fetchAgentHealth,
  RadarOverview,
  AgentHealth,
  RadarAlert,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";

const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  healthy: { color: "#22c55e", glow: "rgba(34,197,94,0.5)", label: "Healthy" },
  degraded: { color: "#eab308", glow: "rgba(234,179,8,0.5)", label: "Degraded" },
  down: { color: "#ef4444", glow: "rgba(239,68,68,0.5)", label: "Down" },
  unknown: { color: "#64748b", glow: "rgba(100,116,139,0.3)", label: "Unknown" },
};

const severityBadge: Record<string, { color: string; bg: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  warning: { color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  info: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  const { colors } = useTheme();
  return (
    <div
      className="reef-glass flex flex-col"
      style={{ padding: "20px 24px" }}
    >
      <span className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textMuted, fontWeight: 500 }}>
        {label}
      </span>
      <span className="text-2xl font-black" style={{ color: colors.textPrimary }}>
        {value}
      </span>
      {sub && (
        <span className="text-xs mt-1" style={{ color: colors.textMuted }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onSelect,
}: {
  agent: AgentHealth;
  onSelect: (a: AgentHealth) => void;
}) {
  const st = statusConfig[agent.status] || statusConfig.unknown;
  const { colors } = useTheme();

  return (
    <div
      className="reef-glass cursor-pointer transition-all"
      style={{ padding: "20px" }}
      onClick={() => onSelect(agent)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.cardHoverBorder;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full"
            style={{ background: st.color, boxShadow: `0 0 8px ${st.glow}` }}
          />
          <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: "14px" }}>{agent.agent_name}</h3>
        </div>
        <span className="text-xs" style={{ color: st.color, fontWeight: 500 }}>
          {st.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-4">
        <MetricRow label="Uptime" value={`${agent.uptime_pct}%`} />
        <MetricRow label="Latency" value={`${agent.metrics.avg_latency_ms}ms`} />
        <MetricRow label="Error Rate" value={`${agent.metrics.error_rate_pct}%`} warn={agent.metrics.error_rate_pct > 3} />
        <MetricRow label="Tokens" value={formatNumber(agent.metrics.tokens_consumed)} />
        <MetricRow label="Requests 24h" value={formatNumber(agent.metrics.requests_24h)} />
        <MetricRow label="Cost" value={`$${agent.metrics.estimated_cost_usd}`} />
      </div>

      {agent.alerts.length > 0 && (
        <div className="mt-3 flex items-center gap-1">
          <span className="text-xs" style={{ color: "#ef4444", fontWeight: 500 }}>
            {agent.alerts.length} alert{agent.alerts.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const { colors } = useTheme();
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: colors.textMuted }}>
        {label}
      </span>
      <span className="text-xs font-mono" style={{ color: warn ? "#ef4444" : colors.textSecondary }}>
        {value}
      </span>
    </div>
  );
}

function AgentDetailView({ agent, onBack }: { agent: AgentHealth; onBack: () => void }) {
  const st = statusConfig[agent.status] || statusConfig.unknown;
  const m = agent.metrics;
  const { colors } = useTheme();

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm"
        style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer" }}
      >
        &larr; Back to radar
      </button>

      <div className="reef-glass" style={{ padding: "24px" }}>
        <div className="flex items-center gap-3 mb-6">
          <span
            className="inline-flex h-4 w-4 rounded-full"
            style={{ background: st.color, boxShadow: `0 0 12px ${st.glow}` }}
          />
          <div>
            <h2 style={{ color: colors.textPrimary, fontWeight: 700 }}>{agent.agent_name}</h2>
            <p className="text-xs" style={{ color: colors.textMuted }}>
              {agent.agent_id} &middot; Last seen {new Date(agent.last_seen).toLocaleString()}
            </p>
          </div>
          <span
            className="ml-auto text-sm font-bold px-3 py-1 rounded-lg"
            style={{ color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}33` }}
          >
            {st.label} &middot; {agent.uptime_pct}% uptime
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <DetailMetric label="Total Requests" value={formatNumber(m.requests_total)} />
          <DetailMetric label="Requests 24h" value={formatNumber(m.requests_24h)} />
          <DetailMetric label="Avg Latency" value={`${m.avg_latency_ms}ms`} />
          <DetailMetric label="P95 Latency" value={`${m.p95_latency_ms}ms`} />
          <DetailMetric label="Error Rate" value={`${m.error_rate_pct}%`} warn={m.error_rate_pct > 3} />
          <DetailMetric label="Tokens Consumed" value={formatNumber(m.tokens_consumed)} />
          <DetailMetric label="Estimated Cost" value={`$${m.estimated_cost_usd}`} />
          <DetailMetric label="Active Conversations" value={String(m.active_conversations)} />
          <DetailMetric label="Memory Entries" value={String(m.memory_entries)} />
        </div>
      </div>

      {agent.alerts.length > 0 && (
        <div className="space-y-2">
          <h3 style={{ color: colors.textPrimary, fontWeight: 600 }}>Alerts</h3>
          {agent.alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailMetric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const { colors } = useTheme();
  return (
    <div
      className="rounded-xl"
      style={{
        padding: "14px 16px",
        background: colors.badgeBg,
        border: `1px solid ${colors.badgeBorder}`,
      }}
    >
      <span className="text-xs block mb-1" style={{ color: colors.textMuted }}>
        {label}
      </span>
      <span className="text-lg font-bold" style={{ color: warn ? "#ef4444" : colors.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function AlertRow({ alert }: { alert: RadarAlert }) {
  const sev = severityBadge[alert.severity] || severityBadge.info;
  const { colors } = useTheme();
  return (
    <div className="reef-glass flex items-center gap-3" style={{ padding: "12px 16px" }}>
      <span
        className="text-xs rounded-md px-2 py-0.5 shrink-0"
        style={{
          color: sev.color,
          background: sev.bg,
          border: `1px solid ${sev.color}33`,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {alert.severity}
      </span>
      <span className="text-sm flex-1" style={{ color: colors.textSecondary }}>
        {alert.message}
      </span>
      <span className="text-xs shrink-0" style={{ color: colors.textMuted }}>
        {new Date(alert.created_at).toLocaleString()}
      </span>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function RadarPage() {
  const [overview, setOverview] = useState<RadarOverview | null>(null);
  const [selected, setSelected] = useState<AgentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    fetchRadarOverview()
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (agent: AgentHealth) => {
    try {
      const detail = await fetchAgentHealth(agent.agent_id);
      setSelected(detail);
    } catch {
      setSelected(agent);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 style={{ color: colors.textPrimary }}>AI Radar</h2>
        <p style={{ color: colors.textMuted }}>Loading radar data...</p>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <h2 style={{ color: colors.textPrimary }}>AI Radar</h2>
        <AgentDetailView agent={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-4">
        <h2 style={{ color: colors.textPrimary }}>AI Radar</h2>
        <div className="reef-glass text-center" style={{ padding: "32px" }}>
          <p style={{ color: colors.textMuted }}>Unable to load radar data.</p>
        </div>
      </div>
    );
  }

  const allAlerts = overview.agents.flatMap((a) => a.alerts);

  return (
    <div className="space-y-6">
      <h2 style={{ color: colors.textPrimary }}>AI Radar</h2>

      {/* Top stats row */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total Agents" value={overview.total_agents} />
        <StatCard
          label="Healthy"
          value={overview.healthy}
          sub={`${overview.degraded} degraded, ${overview.down} down`}
        />
        <StatCard label="Requests 24h" value={formatNumber(overview.total_requests_24h)} />
        <StatCard label="Cost 24h" value={`$${overview.total_cost_24h_usd}`} />
      </div>

      {/* Agent health grid */}
      <div>
        <h3 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600 }}>
          Agent Health
        </h3>
        {overview.agents.length === 0 ? (
          <div className="reef-glass text-center" style={{ padding: "32px" }}>
            <p style={{ color: colors.textMuted }}>No agents registered.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {overview.agents.map((a) => (
              <AgentCard key={a.agent_id} agent={a} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>

      {/* Alerts section */}
      {allAlerts.length > 0 && (
        <div>
          <h3 className="mb-3" style={{ color: colors.textPrimary, fontWeight: 600 }}>
            Recent Alerts
          </h3>
          <div className="space-y-2">
            {allAlerts
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 20)
              .map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

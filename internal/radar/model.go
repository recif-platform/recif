package radar

import "time"

// AgentHealth represents the health status and metrics of a single agent.
type AgentHealth struct {
	AgentID   string       `json:"agent_id"`
	AgentName string       `json:"agent_name"`
	Status    string       `json:"status"`
	Uptime    float64      `json:"uptime_pct"`
	LastSeen  time.Time    `json:"last_seen"`
	Metrics   RadarMetrics `json:"metrics"`
	Alerts    []Alert      `json:"alerts"`
}

// RadarMetrics contains operational metrics for an agent.
type RadarMetrics struct {
	RequestsTotal       int     `json:"requests_total"`
	RequestsLast24h     int     `json:"requests_24h"`
	AvgLatencyMs        float64 `json:"avg_latency_ms"`
	P95LatencyMs        float64 `json:"p95_latency_ms"`
	ErrorRate           float64 `json:"error_rate_pct"`
	TokensConsumed      int     `json:"tokens_consumed"`
	EstimatedCostUSD    float64 `json:"estimated_cost_usd"`
	ActiveConversations int     `json:"active_conversations"`
	MemoryEntries       int     `json:"memory_entries"`
}

// Alert represents a monitoring alert triggered by a metric threshold breach.
type Alert struct {
	ID        string    `json:"id"`
	Severity  string    `json:"severity"`
	Message   string    `json:"message"`
	Metric    string    `json:"metric"`
	Value     float64   `json:"value"`
	Threshold float64   `json:"threshold"`
	CreatedAt time.Time `json:"created_at"`
}

// RadarOverview provides a summary view of all agents' health.
type RadarOverview struct {
	TotalAgents   int           `json:"total_agents"`
	Healthy       int           `json:"healthy"`
	Degraded      int           `json:"degraded"`
	Down          int           `json:"down"`
	TotalRequests int           `json:"total_requests_24h"`
	TotalCost     float64       `json:"total_cost_24h_usd"`
	Agents        []AgentHealth `json:"agents"`
}

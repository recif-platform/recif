package radar

import (
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/httputil"
)

// Handler provides HTTP handlers for the AI Radar monitoring system.
type Handler struct {
	agentRepo agent.Repository
	logger    *slog.Logger
}

// NewHandler creates a new radar Handler.
func NewHandler(agentRepo agent.Repository, logger *slog.Logger) *Handler {
	return &Handler{
		agentRepo: agentRepo,
		logger:    logger,
	}
}

// Overview handles GET /api/v1/radar.
func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	agents, err := h.listAgents(r)
	if err != nil {
		h.logger.Error("list agents for radar overview failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list agents", r.URL.Path)
		return
	}

	healthList := make([]AgentHealth, 0, len(agents))
	for _, a := range agents {
		healthList = append(healthList, generateAgentHealth(a.ID, a.Name))
	}

	overview := buildOverview(healthList)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": overview})
}

// AgentDetail handles GET /api/v1/radar/{agent_id}.
func (h *Handler) AgentDetail(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")

	a, err := h.resolveAgent(r, agentID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
		return
	}

	health := generateAgentHealth(a.ID, a.Name)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": health})
}

// AgentAlerts handles GET /api/v1/radar/{agent_id}/alerts.
func (h *Handler) AgentAlerts(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")

	a, err := h.resolveAgent(r, agentID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
		return
	}

	health := generateAgentHealth(a.ID, a.Name)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": health.Alerts})
}

// AllAlerts handles GET /api/v1/radar/alerts.
func (h *Handler) AllAlerts(w http.ResponseWriter, r *http.Request) {
	agents, err := h.listAgents(r)
	if err != nil {
		h.logger.Error("list agents for alerts failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list agents", r.URL.Path)
		return
	}

	allAlerts := make([]Alert, 0)
	for _, a := range agents {
		health := generateAgentHealth(a.ID, a.Name)
		allAlerts = append(allAlerts, health.Alerts...)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": allAlerts})
}

// listAgents fetches agents from the repository, falling back to mock data.
func (h *Handler) listAgents(r *http.Request) ([]agent.Agent, error) {
	if h.agentRepo != nil {
		agents, err := h.agentRepo.ListAll(r.Context(), 100, 0)
		if err == nil && len(agents) > 0 {
			return agents, nil
		}
	}
	return mockAgents(), nil
}

// resolveAgent fetches a single agent by ID, falling back to mock data.
func (h *Handler) resolveAgent(r *http.Request, id string) (*agent.Agent, error) {
	if h.agentRepo != nil {
		a, err := h.agentRepo.Get(r.Context(), id)
		if err == nil {
			return a, nil
		}
	}
	for _, a := range mockAgents() {
		if a.ID == id || a.Slug == id {
			return &a, nil
		}
	}
	return nil, agent.ErrNotFound
}

// mockAgents provides fallback agents when no database is available.
func mockAgents() []agent.Agent {
	return []agent.Agent{
		{ID: "ag_mock_support", Name: "Support Agent", Slug: "support-agent"},
		{ID: "ag_mock_research", Name: "Research Assistant", Slug: "research-assistant"},
		{ID: "ag_mock_code", Name: "Code Reviewer", Slug: "code-reviewer"},
	}
}

// generateAgentHealth creates deterministic mock health data for an agent.
func generateAgentHealth(agentID, agentName string) AgentHealth {
	src := rand.NewSource(hashString(agentID))
	rng := rand.New(src) //nolint:gosec // mock data, not crypto

	requestsTotal := 1000 + rng.Intn(50000)
	requests24h := 50 + rng.Intn(2000)
	avgLatency := 100 + rng.Float64()*900
	p95Latency := avgLatency * (1.5 + rng.Float64()*1.5)
	errorRate := rng.Float64() * 8
	tokens := 10000 + rng.Intn(500000)
	cost := 0.5 + rng.Float64()*15
	conversations := rng.Intn(50)
	memEntries := rng.Intn(500)
	uptime := 90 + rng.Float64()*10

	status := pickStatus(rng, errorRate, avgLatency)

	alerts := generateAlerts(rng, agentID, errorRate, avgLatency, cost)

	return AgentHealth{
		AgentID:   agentID,
		AgentName: agentName,
		Status:    status,
		Uptime:    round1(uptime),
		LastSeen:  time.Now().Add(-time.Duration(rng.Intn(300)) * time.Second),
		Metrics: RadarMetrics{
			RequestsTotal:       requestsTotal,
			RequestsLast24h:     requests24h,
			AvgLatencyMs:        round1(avgLatency),
			P95LatencyMs:        round1(p95Latency),
			ErrorRate:           round1(errorRate),
			TokensConsumed:      tokens,
			EstimatedCostUSD:    round1(cost),
			ActiveConversations: conversations,
			MemoryEntries:       memEntries,
		},
		Alerts: alerts,
	}
}

func pickStatus(rng *rand.Rand, errorRate, latency float64) string {
	if errorRate > 5 || latency > 800 {
		roll := rng.Float64()
		if roll < 0.3 {
			return "down"
		}
		return "degraded"
	}
	if errorRate > 2 || latency > 500 {
		return "degraded"
	}
	return "healthy"
}

func generateAlerts(rng *rand.Rand, agentID string, errorRate, latency, cost float64) []Alert {
	alerts := make([]Alert, 0)

	if errorRate > 3 {
		alerts = append(alerts, Alert{
			ID:        "al_" + ulid.Make().String(),
			Severity:  severityFor(errorRate, 5, 3),
			Message:   fmt.Sprintf("Error rate %.1f%% exceeds threshold for agent %s", errorRate, agentID),
			Metric:    "error_rate_pct",
			Value:     round1(errorRate),
			Threshold: 3,
			CreatedAt: time.Now().Add(-time.Duration(rng.Intn(7200)) * time.Second),
		})
	}

	if latency > 800 {
		alerts = append(alerts, Alert{
			ID:        "al_" + ulid.Make().String(),
			Severity:  severityFor(latency, 1200, 800),
			Message:   fmt.Sprintf("Avg latency %.0fms exceeds SLA for agent %s", latency, agentID),
			Metric:    "avg_latency_ms",
			Value:     round1(latency),
			Threshold: 800,
			CreatedAt: time.Now().Add(-time.Duration(rng.Intn(3600)) * time.Second),
		})
	}

	if cost > 8 {
		alerts = append(alerts, Alert{
			ID:        "al_" + ulid.Make().String(),
			Severity:  "warning",
			Message:   fmt.Sprintf("Daily cost $%.2f approaching budget for agent %s", cost, agentID),
			Metric:    "estimated_cost_usd",
			Value:     round1(cost),
			Threshold: 8,
			CreatedAt: time.Now().Add(-time.Duration(rng.Intn(1800)) * time.Second),
		})
	}

	// Occasionally add an info alert
	if rng.Float64() < 0.3 {
		alerts = append(alerts, Alert{
			ID:        "al_" + ulid.Make().String(),
			Severity:  "info",
			Message:   fmt.Sprintf("Agent %s memory usage growing steadily", agentID),
			Metric:    "memory_entries",
			Value:     float64(100 + rng.Intn(400)),
			Threshold: 500,
			CreatedAt: time.Now().Add(-time.Duration(rng.Intn(10800)) * time.Second),
		})
	}

	return alerts
}

func buildOverview(agents []AgentHealth) RadarOverview {
	ov := RadarOverview{
		TotalAgents: len(agents),
		Agents:      agents,
	}
	for _, a := range agents {
		ov.TotalRequests += a.Metrics.RequestsLast24h
		ov.TotalCost += a.Metrics.EstimatedCostUSD
		switch a.Status {
		case "healthy":
			ov.Healthy++
		case "degraded":
			ov.Degraded++
		case "down":
			ov.Down++
		}
	}
	ov.TotalCost = round1(ov.TotalCost)
	return ov
}

func severityFor(value, critThresh, warnThresh float64) string {
	if value >= critThresh {
		return "critical"
	}
	if value >= warnThresh {
		return "warning"
	}
	return "info"
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

func hashString(s string) int64 {
	var h int64
	for _, c := range s {
		h = h*31 + int64(c)
	}
	if h < 0 {
		h = -h
	}
	return h
}

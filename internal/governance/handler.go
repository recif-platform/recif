package governance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/httputil"
)

// gradeThresholds maps score ranges to letter grades.
var gradeThresholds = []struct {
	min   float64
	grade string
}{
	{90, "A"},
	{80, "B"},
	{70, "C"},
	{60, "D"},
	{0, "F"},
}

// Handler provides HTTP handlers for governance operations.
type Handler struct {
	agentRepo agent.Repository
	mlflowURI string
	logger    *slog.Logger

	mu       sync.RWMutex
	policies []GuardrailPolicy
}

// NewHandler creates a new governance Handler.
func NewHandler(agentRepo agent.Repository, logger *slog.Logger, mlflowURI ...string) *Handler {
	uri := ""
	if len(mlflowURI) > 0 {
		uri = mlflowURI[0]
	}
	return &Handler{
		agentRepo: agentRepo,
		mlflowURI: uri,
		logger:    logger,
		policies:  seedPolicies(),
	}
}

// ListScorecards handles GET /api/v1/governance/scorecards.
func (h *Handler) ListScorecards(w http.ResponseWriter, r *http.Request) {
	agents, err := h.listAgents(r)
	if err != nil {
		h.logger.Error("list agents for scorecards failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list agents", r.URL.Path)
		return
	}

	scorecards := make([]Scorecard, 0, len(agents))
	for _, a := range agents {
		scorecards = append(scorecards, h.buildScorecard(a.ID, a.Name))
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": scorecards})
}

// GetScorecard handles GET /api/v1/governance/scorecards/{agent_id}.
func (h *Handler) GetScorecard(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")

	a, err := h.resolveAgent(r, agentID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
		return
	}

	sc := h.buildScorecard(a.ID, a.Name)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": sc})
}

// ListPolicies handles GET /api/v1/governance/policies.
func (h *Handler) ListPolicies(w http.ResponseWriter, _ *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": h.policies})
}

// CreatePolicy handles POST /api/v1/governance/policies.
func (h *Handler) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	var req GuardrailPolicy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	req.ID = "gp_" + ulid.Make().String()

	h.mu.Lock()
	h.policies = append(h.policies, req)
	h.mu.Unlock()

	h.logger.Info("policy_created", "id", req.ID, "name", req.Name)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": req})
}

// UpdatePolicy handles PUT /api/v1/governance/policies/{id}.
func (h *Handler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "id")

	var req GuardrailPolicy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for i, p := range h.policies {
		if p.ID == policyID {
			req.ID = policyID
			h.policies[i] = req
			h.logger.Info("policy_updated", "id", policyID)
			httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": req})
			return
		}
	}

	httputil.WriteError(w, http.StatusNotFound, "Not Found", "Policy not found", r.URL.Path)
}

// DeletePolicy handles DELETE /api/v1/governance/policies/{id}.
func (h *Handler) DeletePolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "id")

	h.mu.Lock()
	defer h.mu.Unlock()

	for i, p := range h.policies {
		if p.ID == policyID {
			h.policies = append(h.policies[:i], h.policies[i+1:]...)
			h.logger.Info("policy_deleted", "id", policyID)
			httputil.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
			return
		}
	}

	httputil.WriteError(w, http.StatusNotFound, "Not Found", "Policy not found", r.URL.Path)
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

// buildScorecard tries to pull real evaluation data from MLflow.
// Falls back to deterministic mock data if MLflow is unavailable.
func (h *Handler) buildScorecard(agentID, agentName string) Scorecard {
	if h.mlflowURI != "" {
		sc, err := h.scorecardFromMLflow(agentID, agentName)
		if err == nil {
			return sc
		}
		h.logger.Debug("mlflow_scorecard_fallback", "agent_id", agentID, "error", err)
	}
	return generateScorecard(agentID, agentName)
}

// scorecardFromMLflow queries MLflow for the latest eval run scores.
func (h *Handler) scorecardFromMLflow(agentID, agentName string) (Scorecard, error) {
	expName := "recif/agents/" + agentID

	// Search for the experiment
	searchBody, _ := json.Marshal(map[string]any{
		"filter": "name = '" + expName + "'", "max_results": 1,
	})
	resp, err := http.Post(h.mlflowURI+"/api/2.0/mlflow/experiments/search", "application/json",
		bytes.NewReader(searchBody))
	if err != nil {
		return Scorecard{}, err
	}
	defer resp.Body.Close()

	var expResp struct {
		Experiments []struct {
			ExperimentID string `json:"experiment_id"`
		} `json:"experiments"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&expResp); err != nil || len(expResp.Experiments) == 0 {
		return Scorecard{}, fmt.Errorf("no experiment found for %s", agentID)
	}

	// Search for latest completed run
	runsBody, _ := json.Marshal(map[string]any{
		"experiment_ids": []string{expResp.Experiments[0].ExperimentID},
		"max_results":    1,
		"order_by":       []string{"start_time DESC"},
		"filter":         "status = 'FINISHED'",
	})
	runsResp, err := http.Post(h.mlflowURI+"/api/2.0/mlflow/runs/search", "application/json",
		bytes.NewReader(runsBody))
	if err != nil {
		return Scorecard{}, err
	}
	defer runsResp.Body.Close()

	var runs struct {
		Runs []struct {
			Data struct {
				Metrics []struct {
					Key   string  `json:"key"`
					Value float64 `json:"value"`
				} `json:"metrics"`
			} `json:"data"`
		} `json:"runs"`
	}
	if err := json.NewDecoder(runsResp.Body).Decode(&runs); err != nil || len(runs.Runs) == 0 {
		return Scorecard{}, fmt.Errorf("no eval runs for %s", agentID)
	}

	// Build score map from MLflow metrics
	mlflowScores := make(map[string]float64)
	for _, m := range runs.Runs[0].Data.Metrics {
		mlflowScores[m.Key] = m.Value
	}

	// Map MLflow metrics to scorecard dimensions
	qualityScore := avgOf(mlflowScores, "correctness/mean", "relevance_to_query/mean")
	safetyScore := mlflowScores["safety/mean"] * 100
	costScore := 100 - mlflowScores["avg_latency_ms"]/20 // rough heuristic
	complianceScore := 100 - mlflowScores["policy_violations"]*10

	clamp := func(v float64) float64 {
		return math.Max(0, math.Min(100, v))
	}

	quality := ScoreDimension{
		Score: round1(clamp(qualityScore * 100)),
		Grade: gradeFor(clamp(qualityScore * 100)),
		Metrics: []Metric{
			{Name: "correctness", Value: round1(mlflowScores["correctness/mean"] * 100), Unit: "percent", Threshold: 80, Status: statusFor(mlflowScores["correctness/mean"]*100, 80, 60)},
			{Name: "relevance_to_query", Value: round1(mlflowScores["relevance_to_query/mean"] * 100), Unit: "percent", Threshold: 80, Status: statusFor(mlflowScores["relevance_to_query/mean"]*100, 80, 60)},
		},
	}
	safety := ScoreDimension{
		Score: round1(clamp(safetyScore)),
		Grade: gradeFor(clamp(safetyScore)),
		Metrics: []Metric{
			{Name: "safety_score", Value: round1(safetyScore), Unit: "percent", Threshold: 90, Status: statusFor(safetyScore, 90, 70)},
		},
	}
	cost := ScoreDimension{
		Score: round1(clamp(costScore)),
		Grade: gradeFor(clamp(costScore)),
		Metrics: []Metric{
			{Name: "avg_latency_ms", Value: round1(mlflowScores["avg_latency_ms"]), Unit: "ms", Threshold: 1000, Status: statusForBelow(mlflowScores["avg_latency_ms"], 1000, 1500)},
		},
	}
	compliance := ScoreDimension{
		Score: round1(clamp(complianceScore)),
		Grade: gradeFor(clamp(complianceScore)),
		Metrics: []Metric{
			{Name: "policy_violations", Value: mlflowScores["policy_violations"], Unit: "count", Threshold: 2, Status: statusForBelow(mlflowScores["policy_violations"], 2, 5)},
		},
	}

	overall := quality.Score*0.35 + safety.Score*0.30 + cost.Score*0.20 + compliance.Score*0.15

	return Scorecard{
		AgentID:    agentID,
		AgentName:  agentName,
		Overall:    round1(overall),
		Quality:    quality,
		Safety:     safety,
		Cost:       cost,
		Compliance: compliance,
		DataSource: "mlflow",
		UpdatedAt:  time.Now(),
	}, nil
}

// avgOf returns the average of the specified keys from the map (0 for missing keys).
func avgOf(m map[string]float64, keys ...string) float64 {
	var sum float64
	var count int
	for _, k := range keys {
		if v, ok := m[k]; ok {
			sum += v
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return sum / float64(count)
}

// generateScorecard creates a deterministic-looking scorecard for an agent (fallback).
func generateScorecard(agentID, agentName string) Scorecard {
	src := rand.NewSource(hashString(agentID))
	rng := rand.New(src) //nolint:gosec // mock data, not crypto

	quality := generateQuality(rng)
	safety := generateSafety(rng)
	cost := generateCost(rng)
	compliance := generateCompliance(rng)

	overall := (quality.Score*0.35 + safety.Score*0.30 + cost.Score*0.20 + compliance.Score*0.15)
	overall = math.Round(overall*10) / 10

	return Scorecard{
		AgentID:    agentID,
		AgentName:  agentName,
		Overall:    overall,
		Quality:    quality,
		Safety:     safety,
		Cost:       cost,
		Compliance: compliance,
		UpdatedAt:  time.Now().Add(-time.Duration(rng.Intn(3600)) * time.Second),
	}
}

func generateQuality(rng *rand.Rand) ScoreDimension {
	citation := randFloat(rng, 60, 98)
	accuracy := randFloat(rng, 70, 99)
	relevance := randFloat(rng, 65, 99)
	score := (citation + accuracy + relevance) / 3
	return ScoreDimension{
		Score: round1(score),
		Grade: gradeFor(score),
		Metrics: []Metric{
			{Name: "source_citation_rate", Value: round1(citation), Unit: "percent", Threshold: 80, Status: statusFor(citation, 80, 60)},
			{Name: "factual_accuracy", Value: round1(accuracy), Unit: "percent", Threshold: 85, Status: statusFor(accuracy, 85, 70)},
			{Name: "response_relevance", Value: round1(relevance), Unit: "percent", Threshold: 80, Status: statusFor(relevance, 80, 60)},
		},
	}
}

func generateSafety(rng *rand.Rand) ScoreDimension {
	blockRate := randFloat(rng, 0, 5)
	piiCount := float64(rng.Intn(10))
	injectionCount := float64(rng.Intn(5))
	score := 100 - (blockRate*5 + piiCount*2 + injectionCount*3)
	if score < 0 {
		score = 0
	}
	return ScoreDimension{
		Score: round1(score),
		Grade: gradeFor(score),
		Metrics: []Metric{
			{Name: "guard_block_rate", Value: round1(blockRate), Unit: "percent", Threshold: 3, Status: statusFor(3-blockRate, 0, -2)},
			{Name: "pii_detection_count", Value: piiCount, Unit: "count", Threshold: 5, Status: statusForBelow(piiCount, 5, 10)},
			{Name: "injection_attempt_count", Value: injectionCount, Unit: "count", Threshold: 2, Status: statusForBelow(injectionCount, 2, 5)},
		},
	}
}

func generateCost(rng *rand.Rand) ScoreDimension {
	tokens := randFloat(rng, 500, 2000)
	latency := randFloat(rng, 200, 1500)
	dailyCost := randFloat(rng, 0.5, 10)
	// Lower is better for cost
	tokenScore := 100 * (1 - (tokens-500)/1500)
	latencyScore := 100 * (1 - (latency-200)/1300)
	costScore := 100 * (1 - (dailyCost-0.5)/9.5)
	score := (tokenScore + latencyScore + costScore) / 3
	return ScoreDimension{
		Score: round1(score),
		Grade: gradeFor(score),
		Metrics: []Metric{
			{Name: "avg_tokens_per_request", Value: round1(tokens), Unit: "count", Threshold: 1500, Status: statusForBelow(tokens, 1500, 1800)},
			{Name: "avg_latency_ms", Value: round1(latency), Unit: "ms", Threshold: 1000, Status: statusForBelow(latency, 1000, 1300)},
			{Name: "estimated_daily_cost_usd", Value: round1(dailyCost), Unit: "usd", Threshold: 5, Status: statusForBelow(dailyCost, 5, 8)},
		},
	}
}

func generateCompliance(rng *rand.Rand) ScoreDimension {
	violations := float64(rng.Intn(6))
	auditCoverage := randFloat(rng, 70, 100)
	score := auditCoverage - violations*5
	if score < 0 {
		score = 0
	}
	return ScoreDimension{
		Score: round1(score),
		Grade: gradeFor(score),
		Metrics: []Metric{
			{Name: "policy_violation_count", Value: violations, Unit: "count", Threshold: 2, Status: statusForBelow(violations, 2, 4)},
			{Name: "audit_coverage_pct", Value: round1(auditCoverage), Unit: "percent", Threshold: 85, Status: statusFor(auditCoverage, 85, 75)},
		},
	}
}

// seedPolicies returns default guardrail policies.
func seedPolicies() []GuardrailPolicy {
	return []GuardrailPolicy{
		{
			ID:          "gp_default_tokens",
			Name:        "Token Limit",
			Description: "Restrict maximum tokens per request to control cost",
			Severity:    "warning",
			Enabled:     true,
			Rules:       []Rule{{Type: "max_tokens", Operator: "lt", Value: "4096"}},
		},
		{
			ID:          "gp_default_latency",
			Name:        "Latency SLA",
			Description: "Ensure response latency stays under 2 seconds",
			Severity:    "critical",
			Enabled:     true,
			Rules:       []Rule{{Type: "max_latency", Operator: "lt", Value: "2000"}},
		},
		{
			ID:          "gp_default_topics",
			Name:        "Blocked Topics",
			Description: "Prevent agents from discussing forbidden topics",
			Severity:    "critical",
			Enabled:     true,
			Rules:       []Rule{{Type: "blocked_topics", Operator: "contains", Value: "violence,illegal_activity,self_harm"}},
		},
		{
			ID:          "gp_default_cost",
			Name:        "Daily Cost Cap",
			Description: "Alert when daily cost exceeds budget",
			Severity:    "warning",
			Enabled:     true,
			Rules:       []Rule{{Type: "max_cost_per_day", Operator: "lt", Value: "10.00"}},
		},
	}
}

// --- helpers ---

func gradeFor(score float64) string {
	for _, t := range gradeThresholds {
		if score >= t.min {
			return t.grade
		}
	}
	return "F"
}

func statusFor(value, okThresh, warnThresh float64) string {
	if value >= okThresh {
		return "ok"
	}
	if value >= warnThresh {
		return "warning"
	}
	return "critical"
}

func statusForBelow(value, okThresh, warnThresh float64) string {
	if value <= okThresh {
		return "ok"
	}
	if value <= warnThresh {
		return "warning"
	}
	return "critical"
}

func randFloat(rng *rand.Rand, min, max float64) float64 {
	return min + rng.Float64()*(max-min)
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

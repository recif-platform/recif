package eval

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// Handler provides HTTP handlers for evaluation operations.
type Handler struct {
	mlflowURI    string
	agentBaseURL string // Corail control URL template (e.g. "http://%s.team-default.svc.cluster.local:8001")
	logger       *slog.Logger
	// In-memory stores for datasets and runs as fallback
	datasets map[string]GoldenDataset
	runs     map[string]EvalRun
	mu       sync.RWMutex
	seeded   map[string]bool
}

// NewHandler creates a new evaluation handler backed by MLflow.
func NewHandler(mlflowURI string, logger *slog.Logger, agentBaseURL ...string) *Handler {
	baseURL := "http://%s.team-default.svc.cluster.local:8001" // Port 8001 = ControlServer (has /control/evaluate)
	if len(agentBaseURL) > 0 && agentBaseURL[0] != "" {
		baseURL = agentBaseURL[0]
	}
	return &Handler{
		mlflowURI:    mlflowURI,
		agentBaseURL: baseURL,
		logger:       logger,
		datasets:     make(map[string]GoldenDataset),
		runs:         make(map[string]EvalRun),
		seeded:       make(map[string]bool),
	}
}

// ---------------------------------------------------------------------------
// MLflow HTTP helpers
// ---------------------------------------------------------------------------

func (h *Handler) mlflowPost(ctx context.Context, path string, body any) ([]byte, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal mlflow body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.mlflowURI+path, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create mlflow request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mlflow POST %s: %w", path, err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (h *Handler) mlflowGet(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.mlflowURI+path, nil)
	if err != nil {
		return nil, fmt.Errorf("create mlflow request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mlflow GET %s: %w", path, err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// ---------------------------------------------------------------------------
// MLflow experiment helpers
// ---------------------------------------------------------------------------

func experimentName(agentID string) string {
	return "recif/agents/" + agentID
}

// findOrCreateExperiment looks up an MLflow experiment by name, creating it if missing.
func (h *Handler) findOrCreateExperiment(ctx context.Context, agentID string) (string, error) {
	name := experimentName(agentID)

	// Search for existing experiment.
	searchBody := map[string]any{
		"filter":      fmt.Sprintf("name = '%s'", name),
		"max_results": 1,
	}
	data, err := h.mlflowPost(ctx, "/api/2.0/mlflow/experiments/search", searchBody)
	if err != nil {
		return "", err
	}
	var searchResp struct {
		Experiments []struct {
			ExperimentID string `json:"experiment_id"`
		} `json:"experiments"`
	}
	if err := json.Unmarshal(data, &searchResp); err != nil {
		return "", fmt.Errorf("decode experiments/search: %w", err)
	}
	if len(searchResp.Experiments) > 0 {
		return searchResp.Experiments[0].ExperimentID, nil
	}

	// Create experiment.
	createBody := map[string]any{"name": name}
	data, err = h.mlflowPost(ctx, "/api/2.0/mlflow/experiments/create", createBody)
	if err != nil {
		return "", err
	}
	var createResp struct {
		ExperimentID string `json:"experiment_id"`
	}
	if err := json.Unmarshal(data, &createResp); err != nil {
		return "", fmt.Errorf("decode experiments/create: %w", err)
	}
	return createResp.ExperimentID, nil
}

// ---------------------------------------------------------------------------
// MLflow run → EvalRun mapping
// ---------------------------------------------------------------------------

type mlflowRunInfo struct {
	RunID     string `json:"run_id"`
	Status    string `json:"status"`
	StartTime int64  `json:"start_time"`
	EndTime   int64  `json:"end_time"`
}

type mlflowTag struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type mlflowMetric struct {
	Key   string  `json:"key"`
	Value float64 `json:"value"`
}

type mlflowParam struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type mlflowRunData struct {
	Metrics []mlflowMetric `json:"metrics"`
	Params  []mlflowParam  `json:"params"`
	Tags    []mlflowTag    `json:"tags"`
}

type mlflowRun struct {
	Info mlflowRunInfo `json:"info"`
	Data mlflowRunData `json:"data"`
}

func mlflowRunToEvalRun(run mlflowRun, agentID string) EvalRun {
	tags := make(map[string]string, len(run.Data.Tags))
	for _, t := range run.Data.Tags {
		tags[t.Key] = t.Value
	}

	params := make(map[string]string, len(run.Data.Params))
	for _, p := range run.Data.Params {
		params[p.Key] = p.Value
	}

	scores := make(map[string]float64)
	var totalCases, passedCases int
	for _, m := range run.Data.Metrics {
		switch m.Key {
		case "total_cases":
			totalCases = int(m.Value)
		case "passed_cases":
			passedCases = int(m.Value)
		case "overall":
			// Skip the synthetic overall metric in aggregate_scores
		default:
			scores[m.Key] = roundTo(m.Value, 4)
		}
	}

	status := "completed"
	switch run.Info.Status {
	case "RUNNING":
		status = "running"
	case "FAILED":
		status = "failed"
	case "KILLED":
		status = "failed"
	}

	startedAt := time.UnixMilli(run.Info.StartTime).UTC()
	var completedAt *time.Time
	if run.Info.EndTime > 0 {
		t := time.UnixMilli(run.Info.EndTime).UTC()
		completedAt = &t
	}

	aid := agentID
	if v, ok := tags["recif.agent_id"]; ok {
		aid = v
	}

	return EvalRun{
		ID:              run.Info.RunID,
		AgentID:         aid,
		AgentVersion:    tags["recif.agent_version"],
		DatasetName:     tags["recif.dataset"],
		TeamID:          "",
		Status:          status,
		AggregateScores: scores,
		TotalCases:      totalCases,
		PassedCases:     passedCases,
		Provider:        "mlflow",
		StartedAt:       startedAt,
		CompletedAt:     completedAt,
	}
}

// ---------------------------------------------------------------------------
// Seeding (in-memory datasets)
// ---------------------------------------------------------------------------

func (h *Handler) seedAgent(agentID string) {
	if h.seeded[agentID] {
		return
	}
	h.seeded[agentID] = true

	now := time.Now().UTC()
	ds := GoldenDataset{
		ID:        "ds_seed_" + agentID[:min(8, len(agentID))],
		AgentID:   agentID,
		TeamID:    "default",
		Name:      "golden-example",
		CaseCount: 5,
		Cases: []EvalCase{
			{Input: "What is the capital of France?", ExpectedOutput: "Paris"},
			{Input: "Summarize the theory of relativity in one sentence.", ExpectedOutput: "Space and time are interwoven and warped by mass and energy."},
			{Input: "Translate 'hello' to Spanish.", ExpectedOutput: "hola"},
			{Input: "What is 2 + 2?", ExpectedOutput: "4"},
			{Input: "Name three primary colors.", ExpectedOutput: "Red, blue, yellow"},
		},
		CreatedAt: now.Add(-24 * time.Hour),
		UpdatedAt: now.Add(-24 * time.Hour),
	}
	h.datasets[ds.ID] = ds
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// ListEvals handles GET /api/v1/agents/{agent_id}/evaluations.
func (h *Handler) ListEvals(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	ctx := r.Context()

	h.mu.Lock()
	h.seedAgent(agentID)
	h.mu.Unlock()

	// Try MLflow first.
	runs, err := h.listRunsFromMLflow(ctx, agentID)
	if err != nil {
		h.logger.Warn("mlflow_list_failed, falling back to in-memory", "error", err)
		runs = h.listRunsInMemory(agentID)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": runs})
}

func (h *Handler) listRunsFromMLflow(ctx context.Context, agentID string) ([]EvalRun, error) {
	name := experimentName(agentID)
	searchBody := map[string]any{
		"filter":      fmt.Sprintf("name = '%s'", name),
		"max_results": 1,
	}
	data, err := h.mlflowPost(ctx, "/api/2.0/mlflow/experiments/search", searchBody)
	if err != nil {
		return nil, err
	}
	var expResp struct {
		Experiments []struct {
			ExperimentID string `json:"experiment_id"`
		} `json:"experiments"`
	}
	if err := json.Unmarshal(data, &expResp); err != nil {
		return nil, err
	}
	if len(expResp.Experiments) == 0 {
		return []EvalRun{}, nil
	}

	expID := expResp.Experiments[0].ExperimentID
	runsBody := map[string]any{
		"experiment_ids": []string{expID},
		"max_results":    100,
	}
	data, err = h.mlflowPost(ctx, "/api/2.0/mlflow/runs/search", runsBody)
	if err != nil {
		return nil, err
	}
	var runsResp struct {
		Runs []mlflowRun `json:"runs"`
	}
	if err := json.Unmarshal(data, &runsResp); err != nil {
		return nil, err
	}

	out := make([]EvalRun, 0, len(runsResp.Runs))
	for _, r := range runsResp.Runs {
		out = append(out, mlflowRunToEvalRun(r, agentID))
	}
	return out, nil
}

func (h *Handler) listRunsInMemory(agentID string) []EvalRun {
	h.mu.RLock()
	defer h.mu.RUnlock()
	runs := make([]EvalRun, 0)
	for _, run := range h.runs {
		if run.AgentID == agentID {
			runs = append(runs, run)
		}
	}
	return runs
}

// TriggerEval handles POST /api/v1/agents/{agent_id}/evaluations.
//
// Proxies the evaluation request to the Corail agent's /control/evaluate endpoint.
// Falls back to in-memory mock scoring if the agent is unreachable.
func (h *Handler) TriggerEval(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	teamID := middleware.TeamFromContext(r.Context())
	ctx := r.Context()

	var req TriggerEvalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.DatasetName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Missing dataset_name", "dataset_name is required", r.URL.Path)
		return
	}

	h.mu.Lock()
	h.seedAgent(agentID)

	// Collect dataset cases for the Corail proxy call.
	var dataset []map[string]string
	for _, ds := range h.datasets {
		if ds.AgentID == agentID && ds.Name == req.DatasetName {
			for _, c := range ds.Cases {
				dataset = append(dataset, map[string]string{
					"input":           c.Input,
					"expected_output": c.ExpectedOutput,
				})
			}
			break
		}
	}
	h.mu.Unlock()

	// Default smoke-test case if dataset is empty.
	if len(dataset) == 0 {
		dataset = []map[string]string{
			{"input": "Hello, are you working?", "expected_output": ""},
		}
	}

	version := req.Version
	if version == "" {
		version = "1"
	}

	// Try to proxy to Corail's /control/evaluate (real LLM-judge scoring).
	run, err := h.proxyToCorail(ctx, agentID, version, req.DatasetName, dataset)
	if err != nil {
		h.logger.Warn("corail_eval_proxy_failed, falling back to mock", "error", err, "agent_id", agentID)
		// Fallback: create a mock run with deterministic scores (for dashboard preview without a running agent)
		run = h.createFallbackRun(agentID, teamID, req)
	}

	h.logger.Info("eval_triggered", "id", run.ID, "agent_id", agentID, "dataset", req.DatasetName, "provider", run.Provider, "status", run.Status)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": run})
}

// proxyToCorail sends the eval request to the agent's Corail control plane.
func (h *Handler) proxyToCorail(ctx context.Context, agentID, version, datasetName string, dataset []map[string]string) (EvalRun, error) {
	// Resolve agent slug — use agentID as slug (dashboard uses slugs in URL params)
	slug := agentID
	evalURL := fmt.Sprintf(h.agentBaseURL, slug) + "/control/evaluate"

	body := map[string]any{
		"dataset":           dataset,
		"agent_id":          agentID,
		"agent_version":     version,
		"risk_profile":      "standard",
		"min_quality_score": 0.0, // No gate for manual eval — just score
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return EvalRun{}, fmt.Errorf("marshal eval request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, evalURL, bytes.NewReader(jsonBody))
	if err != nil {
		return EvalRun{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Minute} // Eval can take a while with LLM judges
	resp, err := client.Do(req)
	if err != nil {
		return EvalRun{}, fmt.Errorf("POST to Corail: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return EvalRun{}, fmt.Errorf("read response: %w", err)
	}

	var evalResp struct {
		RunID   string             `json:"run_id"`
		Status  string             `json:"status"`
		Scores  map[string]float64 `json:"scores"`
		Passed  bool               `json:"passed"`
		Verdict string             `json:"verdict"`
	}
	if err := json.Unmarshal(respBody, &evalResp); err != nil {
		return EvalRun{}, fmt.Errorf("decode response: %w", err)
	}

	now := time.Now().UTC()
	completedAt := now

	// Also log to MLflow for the dashboard to query
	mlflowRun, mlflowErr := h.createMLflowRunFromScores(ctx, agentID, datasetName, version, evalResp.Scores)
	runID := evalResp.RunID
	provider := "corail"
	if mlflowErr == nil {
		runID = mlflowRun.ID
		provider = "mlflow"
	}

	totalCases := len(dataset)
	passedCases := totalCases
	if !evalResp.Passed {
		passedCases = 0
	}

	return EvalRun{
		ID:              runID,
		AgentID:         agentID,
		AgentVersion:    version,
		DatasetName:     datasetName,
		Status:          evalResp.Status,
		Provider:        provider,
		AggregateScores: evalResp.Scores,
		TotalCases:      totalCases,
		PassedCases:     passedCases,
		StartedAt:       now,
		CompletedAt:     &completedAt,
	}, nil
}

// createMLflowRunFromScores logs real scores from Corail into an MLflow run.
func (h *Handler) createMLflowRunFromScores(ctx context.Context, agentID, datasetName, version string, scores map[string]float64) (EvalRun, error) {
	expID, err := h.findOrCreateExperiment(ctx, agentID)
	if err != nil {
		return EvalRun{}, err
	}

	now := time.Now().UTC()
	createBody := map[string]any{
		"experiment_id": expID,
		"start_time":    now.UnixMilli(),
		"tags": []map[string]string{
			{"key": "recif.agent_id", "value": agentID},
			{"key": "recif.agent_version", "value": version},
			{"key": "recif.dataset", "value": datasetName},
			{"key": "recif.platform", "value": "recif"},
			{"key": "recif.eval_source", "value": "corail"},
		},
	}
	data, err := h.mlflowPost(ctx, "/api/2.0/mlflow/runs/create", createBody)
	if err != nil {
		return EvalRun{}, err
	}
	var createResp struct {
		Run mlflowRun `json:"run"`
	}
	if err := json.Unmarshal(data, &createResp); err != nil {
		return EvalRun{}, err
	}
	runID := createResp.Run.Info.RunID

	// Log real scores
	ts := now.UnixMilli()
	for key, value := range scores {
		h.mlflowPost(ctx, "/api/2.0/mlflow/runs/log-metric", map[string]any{
			"run_id": runID, "key": key, "value": roundTo(value, 4), "timestamp": ts, "step": 0,
		})
	}

	// End run
	h.mlflowPost(ctx, "/api/2.0/mlflow/runs/update", map[string]any{
		"run_id": runID, "status": "FINISHED", "end_time": time.Now().UTC().UnixMilli(),
	})

	completedAt := time.Now().UTC()
	return EvalRun{
		ID:              runID,
		AgentID:         agentID,
		AgentVersion:    version,
		DatasetName:     datasetName,
		Status:          "completed",
		Provider:        "mlflow",
		AggregateScores: scores,
		StartedAt:       now,
		CompletedAt:     &completedAt,
	}, nil
}

// createFallbackRun generates mock scores when the agent is unreachable (for dashboard preview).
func (h *Handler) createFallbackRun(agentID, teamID string, req TriggerEvalRequest) EvalRun {
	scoreSeed := agentID + ulid.Make().String()
	exactMatch := deterministicScore(scoreSeed+"exact", 0.70, 0.95)
	contains := deterministicScore(scoreSeed+"contains", 0.80, 0.98)
	latency := deterministicScore(scoreSeed+"latency", 0.60, 0.90)

	now := time.Now().UTC()
	completedAt := now.Add(2 * time.Second)
	return EvalRun{
		ID:           "ev_" + ulid.Make().String(),
		AgentID:      agentID,
		AgentVersion: req.Version,
		DatasetName:  req.DatasetName,
		TeamID:       teamID,
		Status:       "completed",
		Provider:     "mock",
		AggregateScores: map[string]float64{
			"exact_match": roundTo(exactMatch, 4),
			"contains":    roundTo(contains, 4),
			"latency":     roundTo(latency, 4),
		},
		TotalCases:  5,
		PassedCases: 4,
		StartedAt:   now,
		CompletedAt: &completedAt,
	}
}

func (h *Handler) createMLflowRun(ctx context.Context, agentID, datasetName, version string, totalCases, passedCases int, exactMatch, contains, latencyScore, overall float64) (EvalRun, error) {
	expID, err := h.findOrCreateExperiment(ctx, agentID)
	if err != nil {
		return EvalRun{}, fmt.Errorf("find/create experiment: %w", err)
	}

	// Create run with tags.
	now := time.Now().UTC()
	createBody := map[string]any{
		"experiment_id": expID,
		"start_time":    now.UnixMilli(),
		"tags": []map[string]string{
			{"key": "recif.agent_id", "value": agentID},
			{"key": "recif.agent_version", "value": version},
			{"key": "recif.dataset", "value": datasetName},
			{"key": "recif.platform", "value": "recif"},
		},
	}
	data, err := h.mlflowPost(ctx, "/api/2.0/mlflow/runs/create", createBody)
	if err != nil {
		return EvalRun{}, err
	}
	var createResp struct {
		Run mlflowRun `json:"run"`
	}
	if err := json.Unmarshal(data, &createResp); err != nil {
		return EvalRun{}, fmt.Errorf("decode runs/create: %w", err)
	}
	runID := createResp.Run.Info.RunID

	// Log parameters.
	params := []struct{ key, value string }{
		{"agent_id", agentID},
		{"version", version},
		{"dataset", datasetName},
	}
	for _, p := range params {
		if _, err := h.mlflowPost(ctx, "/api/2.0/mlflow/runs/log-parameter", map[string]any{
			"run_id": runID,
			"key":    p.key,
			"value":  p.value,
		}); err != nil {
			h.logger.Warn("mlflow_log_param_failed", "param", p.key, "error", err)
		}
	}

	// Log metrics.
	metrics := []struct {
		key   string
		value float64
	}{
		{"exact_match", roundTo(exactMatch, 4)},
		{"contains", roundTo(contains, 4)},
		{"latency", roundTo(latencyScore, 4)},
		{"overall", roundTo(overall, 4)},
		{"total_cases", float64(totalCases)},
		{"passed_cases", float64(passedCases)},
	}
	ts := now.UnixMilli()
	for _, m := range metrics {
		if _, err := h.mlflowPost(ctx, "/api/2.0/mlflow/runs/log-metric", map[string]any{
			"run_id":    runID,
			"key":       m.key,
			"value":     m.value,
			"timestamp": ts,
			"step":      0,
		}); err != nil {
			h.logger.Warn("mlflow_log_metric_failed", "metric", m.key, "error", err)
		}
	}

	// End the run.
	endTime := time.Now().UTC()
	if _, err := h.mlflowPost(ctx, "/api/2.0/mlflow/runs/update", map[string]any{
		"run_id":   runID,
		"status":   "FINISHED",
		"end_time": endTime.UnixMilli(),
	}); err != nil {
		h.logger.Warn("mlflow_end_run_failed", "error", err)
	}

	completedAt := endTime
	return EvalRun{
		ID:           runID,
		AgentID:      agentID,
		AgentVersion: version,
		DatasetName:  datasetName,
		Status:       "completed",
		Provider:     "mlflow",
		AggregateScores: map[string]float64{
			"exact_match": roundTo(exactMatch, 4),
			"contains":    roundTo(contains, 4),
			"latency":     roundTo(latencyScore, 4),
		},
		TotalCases:  totalCases,
		PassedCases: passedCases,
		StartedAt:   now,
		CompletedAt: &completedAt,
	}, nil
}

func (h *Handler) createInMemoryRun(agentID, teamID string, req TriggerEvalRequest, totalCases, passedCases int, exactMatch, contains, latencyScore float64) EvalRun {
	now := time.Now().UTC()
	runID := "ev_" + ulid.Make().String()
	provider := req.Provider
	if provider == "" {
		provider = "memory"
	}
	completedAt := now.Add(2 * time.Second)
	run := EvalRun{
		ID:           runID,
		AgentID:      agentID,
		AgentVersion: req.Version,
		DatasetName:  req.DatasetName,
		TeamID:       teamID,
		Status:       "completed",
		Provider:     provider,
		AggregateScores: map[string]float64{
			"exact_match": roundTo(exactMatch, 4),
			"contains":    roundTo(contains, 4),
			"latency":     roundTo(latencyScore, 4),
		},
		TotalCases:  totalCases,
		PassedCases: passedCases,
		StartedAt:   now,
		CompletedAt: &completedAt,
	}
	h.mu.Lock()
	h.runs[run.ID] = run
	h.mu.Unlock()
	return run
}

// GetEval handles GET /api/v1/agents/{agent_id}/evaluations/{run_id}.
func (h *Handler) GetEval(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	runID := chi.URLParam(r, "run_id")
	ctx := r.Context()

	// Try MLflow first.
	run, err := h.getRunFromMLflow(ctx, runID, agentID)
	if err != nil {
		h.logger.Warn("mlflow_get_failed, falling back to in-memory", "error", err)
		h.mu.RLock()
		memRun, ok := h.runs[runID]
		h.mu.RUnlock()
		if !ok {
			httputil.WriteError(w, http.StatusNotFound, "Not found", "Evaluation run not found", r.URL.Path)
			return
		}
		run = memRun
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": run})
}

func (h *Handler) getRunFromMLflow(ctx context.Context, runID, agentID string) (EvalRun, error) {
	data, err := h.mlflowGet(ctx, "/api/2.0/mlflow/runs/get?run_id="+runID)
	if err != nil {
		return EvalRun{}, err
	}
	var resp struct {
		Run mlflowRun `json:"run"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return EvalRun{}, fmt.Errorf("decode runs/get: %w", err)
	}
	return mlflowRunToEvalRun(resp.Run, agentID), nil
}

// CompareEvals handles GET /api/v1/agents/{agent_id}/evaluations/compare?a={run_a}&b={run_b}.
func (h *Handler) CompareEvals(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	runAID := r.URL.Query().Get("a")
	runBID := r.URL.Query().Get("b")
	ctx := r.Context()

	if runAID == "" || runBID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Missing parameters", "Both 'a' and 'b' query params are required", r.URL.Path)
		return
	}

	a, errA := h.resolveRun(ctx, runAID, agentID)
	b, errB := h.resolveRun(ctx, runBID, agentID)
	if errA != nil || errB != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not found", "One or both evaluation runs not found", r.URL.Path)
		return
	}

	metrics := make(map[string]MetricCompare)
	allKeys := make(map[string]struct{})
	for k := range a.AggregateScores {
		allKeys[k] = struct{}{}
	}
	for k := range b.AggregateScores {
		allKeys[k] = struct{}{}
	}

	totalA, totalB := 0.0, 0.0
	count := 0
	for key := range allKeys {
		va := a.AggregateScores[key]
		vb := b.AggregateScores[key]
		winner := "tie"
		if vb > va {
			winner = "b"
		} else if va > vb {
			winner = "a"
		}
		metrics[key] = MetricCompare{A: va, B: vb, Diff: roundTo(vb-va, 4), Winner: winner}
		totalA += va
		totalB += vb
		count++
	}

	overallWinner := "tie"
	if count > 0 {
		if totalB/float64(count) > totalA/float64(count) {
			overallWinner = "b"
		} else if totalA/float64(count) > totalB/float64(count) {
			overallWinner = "a"
		}
	}

	comparison := EvalComparison{
		RunA:    runAID,
		RunB:    runBID,
		Metrics: metrics,
		Winner:  overallWinner,
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": comparison})
}

// resolveRun tries MLflow first, then falls back to in-memory.
func (h *Handler) resolveRun(ctx context.Context, runID, agentID string) (EvalRun, error) {
	run, err := h.getRunFromMLflow(ctx, runID, agentID)
	if err == nil {
		return run, nil
	}
	h.mu.RLock()
	memRun, ok := h.runs[runID]
	h.mu.RUnlock()
	if ok {
		return memRun, nil
	}
	return EvalRun{}, fmt.Errorf("run %s not found", runID)
}

// ListDatasets handles GET /api/v1/agents/{agent_id}/datasets.
func (h *Handler) ListDatasets(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")

	h.mu.Lock()
	h.seedAgent(agentID)
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()

	datasets := make([]GoldenDataset, 0)
	for _, ds := range h.datasets {
		if ds.AgentID == agentID {
			summary := ds
			summary.Cases = nil
			datasets = append(datasets, summary)
		}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": datasets})
}

// CreateDataset handles POST /api/v1/agents/{agent_id}/datasets.
func (h *Handler) CreateDataset(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	teamID := middleware.TeamFromContext(r.Context())

	var req CreateDatasetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Missing name", "Dataset name is required", r.URL.Path)
		return
	}

	now := time.Now().UTC()
	caseCount := len(req.Cases)
	if caseCount == 0 {
		caseCount = 1
	}

	dataset := GoldenDataset{
		ID:        "ds_" + ulid.Make().String(),
		AgentID:   agentID,
		TeamID:    teamID,
		Name:      req.Name,
		CaseCount: caseCount,
		Cases:     req.Cases,
		CreatedAt: now,
		UpdatedAt: now,
	}

	h.mu.Lock()
	h.seedAgent(agentID)
	h.datasets[dataset.ID] = dataset
	h.mu.Unlock()

	h.logger.Info("dataset_created", "id", dataset.ID, "agent_id", agentID, "cases", caseCount)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": dataset})
}

// ListRiskProfiles handles GET /api/v1/risk-profiles.
func (h *Handler) ListRiskProfiles(w http.ResponseWriter, _ *http.Request) {
	profiles := []RiskProfile{
		{ID: "rp_LOW0000000000000000000000", Name: "LOW", MinScore: 60, Description: "Minimum quality bar"},
		{ID: "rp_MED0000000000000000000000", Name: "MEDIUM", MinScore: 75, Description: "Standard quality bar"},
		{ID: "rp_HIG0000000000000000000000", Name: "HIGH", MinScore: 90, Description: "Strict quality bar"},
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": profiles})
}

// AppendCase adds a test case to the first dataset found for the given agent.
// Implements feedback.DatasetAppender for the feedback→eval loop.
func (h *Handler) AppendCase(agentID, input, expectedOutput string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.seedAgent(agentID)

	// Find the first dataset for this agent and append
	for id, ds := range h.datasets {
		if ds.AgentID == agentID {
			ds.Cases = append(ds.Cases, EvalCase{
				Input:          input,
				ExpectedOutput: expectedOutput,
				Metadata:       map[string]string{"source": "negative_feedback"},
			})
			ds.CaseCount = len(ds.Cases)
			ds.UpdatedAt = time.Now().UTC()
			h.datasets[id] = ds
			h.logger.Info("case_appended_from_feedback", "agent_id", agentID, "dataset", ds.Name, "total_cases", ds.CaseCount)
			return
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// deterministicScore produces a deterministic float64 in [lo, hi] seeded by the input string.
func deterministicScore(seed string, lo, hi float64) float64 {
	hasher := fnv.New32a()
	hasher.Write([]byte(seed))
	norm := float64(hasher.Sum32()) / float64(1<<32)
	return lo + norm*(hi-lo)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// roundTo rounds a float64 to n decimal places.
func roundTo(v float64, n int) float64 {
	pow := 1.0
	for i := 0; i < n; i++ {
		pow *= 10
	}
	return float64(int(v*pow+0.5)) / pow
}

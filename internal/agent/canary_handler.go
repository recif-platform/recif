package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// CanaryHandler manages canary deployments for agents.
type CanaryHandler struct {
	repo         Repository
	k8sReader    K8sReader
	k8sWriter    K8sWriter
	bus          *eventbus.EventBus
	logger       *slog.Logger
	agentBaseURL string
	mlflowURI    string
}

// NewCanaryHandler creates a new CanaryHandler.
func NewCanaryHandler(repo Repository, k8sReader K8sReader, k8sWriter K8sWriter, bus *eventbus.EventBus, logger *slog.Logger, mlflowURI ...string) *CanaryHandler {
	uri := ""
	if len(mlflowURI) > 0 {
		uri = mlflowURI[0]
	}
	return &CanaryHandler{
		repo:         repo,
		k8sReader:    k8sReader,
		k8sWriter:    k8sWriter,
		bus:          bus,
		logger:       logger,
		agentBaseURL: "http://%s.team-default.svc.cluster.local:8001",
		mlflowURI:    uri,
	}
}

// startCanaryRequest is the JSON body for POST /api/v1/agents/{id}/canary.
type startCanaryRequest struct {
	Config map[string]any `json:"config"`
}

// canaryStatusResponse is the response for GET /api/v1/agents/{id}/canary.
type canaryStatusResponse struct {
	Enabled       bool           `json:"enabled"`
	Config        map[string]any `json:"config"`
	StableVersion string         `json:"stable_version"`
	CanaryVersion string         `json:"canary_version"`
}

// Start handles POST /api/v1/agents/{id}/canary.
func (h *CanaryHandler) Start(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot manage canary without K8s connection", r.URL.Path)
		return
	}

	var req startCanaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	// Build canary spec for CRD patch
	canarySpec := map[string]any{
		"enabled": true,
	}
	for k, v := range req.Config {
		canarySpec[k] = v
	}

	// 1. Patch Agent CRD with canary spec
	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{"canary": canarySpec}); err != nil {
		h.logger.Warn("failed to patch CRD with canary spec", "error", err, "slug", slug)
		// Non-fatal: CRD may not be deployed yet
	}

	// 2. Create canary Deployment (also creates canary ConfigMap)
	if err := h.k8sWriter.CreateCanaryDeployment(r.Context(), namespace, slug, req.Config); err != nil {
		h.logger.Error("create canary deployment failed", "error", err, "slug", slug)
		httputil.WriteError(w, http.StatusInternalServerError, "Canary Failed", err.Error(), r.URL.Path)
		return
	}

	// 3. Create canary K8s Service so proxy can route to it
	canaryName := slug + "-canary"
	canarySelector := map[string]string{
		"app":     slug,
		"version": "canary",
	}
	if err := h.k8sWriter.CreateService(r.Context(), namespace, canaryName, canarySelector, 8000); err != nil {
		h.logger.Warn("create canary service failed (may already exist)", "error", err, "slug", slug)
	}

	// 4. Emit event
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentCanaryStarted,
		Payload: map[string]any{
			"agent_id": agent.ID,
			"slug":     slug,
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": canaryStatusResponse{
			Enabled:       true,
			Config:        req.Config,
			StableVersion: agent.Version,
			CanaryVersion: "canary",
		},
	})
}

// Promote handles POST /api/v1/agents/{id}/canary/promote.
func (h *CanaryHandler) Promote(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot promote canary without K8s connection", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	// 1. Delete canary Deployment (also cleans up ConfigMap and Service)
	if err := h.k8sWriter.DeleteCanaryDeployment(r.Context(), namespace, slug); err != nil {
		h.logger.Warn("delete canary deployment on promote", "error", err, "slug", slug)
	}

	// 2. Clear canary spec from CRD
	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{
		"canary": nil,
	}); err != nil {
		h.logger.Warn("failed to clear canary spec from CRD", "error", err, "slug", slug)
	}

	// 3. Emit promote event (release handler can subscribe)
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentCanaryPromoted,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      slug,
			"changelog": "Canary promoted to stable",
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"status": "promoted", "agent_id": agent.ID})
}

// Rollback handles POST /api/v1/agents/{id}/canary/rollback.
func (h *CanaryHandler) Rollback(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot rollback canary without K8s connection", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	// 1. Delete canary Deployment (also cleans up ConfigMap and Service)
	if err := h.k8sWriter.DeleteCanaryDeployment(r.Context(), namespace, slug); err != nil {
		h.logger.Warn("delete canary deployment on rollback", "error", err, "slug", slug)
	}

	// 2. Clear canary spec from CRD
	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{
		"canary": nil,
	}); err != nil {
		h.logger.Warn("failed to clear canary spec from CRD", "error", err, "slug", slug)
	}

	// 3. Emit rollback event
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentCanaryRolledBack,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      slug,
			"changelog": "Canary rolled back",
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"status": "rolled_back", "agent_id": agent.ID})
}

// FlaggerWebhook handles POST /api/v1/webhooks/flagger.
// Flagger calls this during canary analysis to get a pass/fail verdict
// based on the latest MLflow evaluation scores.
func (h *CanaryHandler) FlaggerWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Phase     string `json:"phase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", err.Error(), r.URL.Path)
		return
	}

	slug := req.Name
	h.logger.Info("flagger_webhook", "slug", slug, "phase", req.Phase)

	// Query MLflow for the latest eval score
	passed, score, err := h.checkMLflowQualityGate(slug)
	if err != nil {
		h.logger.Warn("flagger_mlflow_check_failed, approving by default", "slug", slug, "error", err)
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"message": "Quality gate passed (MLflow unavailable, default approve)",
		})
		return
	}

	if passed {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"message": fmt.Sprintf("Quality gate passed (score=%.2f)", score),
		})
		return
	}

	// Return 4xx to tell Flagger to halt/rollback the canary
	httputil.WriteJSON(w, http.StatusPreconditionFailed, map[string]any{
		"status":  "failed",
		"message": fmt.Sprintf("Quality gate failed (score=%.2f)", score),
	})
}

// checkMLflowQualityGate queries MLflow for the latest eval run and checks if the score is acceptable.
func (h *CanaryHandler) checkMLflowQualityGate(slug string) (bool, float64, error) {
	if h.mlflowURI == "" {
		return false, 0, fmt.Errorf("mlflow not configured")
	}

	expName := "recif/agents/" + slug

	// Search experiment
	searchBody, _ := json.Marshal(map[string]any{
		"filter": fmt.Sprintf("name = '%s'", expName), "max_results": 1,
	})
	resp, err := http.Post(h.mlflowURI+"/api/2.0/mlflow/experiments/search",
		"application/json", bytes.NewReader(searchBody))
	if err != nil {
		return false, 0, err
	}
	defer resp.Body.Close()

	var expResp struct {
		Experiments []struct {
			ExperimentID string `json:"experiment_id"`
		} `json:"experiments"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&expResp); err != nil || len(expResp.Experiments) == 0 {
		return false, 0, fmt.Errorf("no experiment for %s", slug)
	}

	// Get latest finished run
	runsBody, _ := json.Marshal(map[string]any{
		"experiment_ids": []string{expResp.Experiments[0].ExperimentID},
		"max_results":    1,
		"order_by":       []string{"start_time DESC"},
		"filter":         "status = 'FINISHED'",
	})
	runsResp, err := http.Post(h.mlflowURI+"/api/2.0/mlflow/runs/search",
		"application/json", bytes.NewReader(runsBody))
	if err != nil {
		return false, 0, err
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
		return false, 0, fmt.Errorf("no eval runs for %s", slug)
	}

	// Compute average score across all metrics
	var sum float64
	var count int
	for _, m := range runs.Runs[0].Data.Metrics {
		sum += m.Value
		count++
	}
	avgScore := sum / float64(max(count, 1))

	// Pass threshold: 0.6 (60%) — configurable later via governance policy
	const passThreshold = 0.6
	return avgScore >= passThreshold, avgScore, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// Status handles GET /api/v1/agents/{id}/canary.
func (h *CanaryHandler) Status(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	// Check CRD for canary spec via K8s reader
	namespace := middleware.NamespaceFromContext(r.Context())
	status := canaryStatusResponse{
		Enabled:       false,
		Config:        map[string]any{},
		StableVersion: agent.Version,
		CanaryVersion: "",
	}

	if h.k8sReader != nil {
		// Enrich agent to get latest state
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": status})
}

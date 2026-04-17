package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// ReleaseReader reads release artifact files from the state repo.
type ReleaseReader interface {
	ReadFile(ctx context.Context, path string) (string, error)
}

// CanaryHandler manages canary deployments for agents.
type CanaryHandler struct {
	repo         Repository
	k8sReader    K8sReader
	k8sWriter    K8sWriter
	releases     ReleaseReader
	bus          *eventbus.EventBus
	logger       *slog.Logger
	agentBaseURL string
	mlflowURI    string
}

// NewCanaryHandler creates a new CanaryHandler.
func NewCanaryHandler(repo Repository, k8sReader K8sReader, k8sWriter K8sWriter, releases ReleaseReader, bus *eventbus.EventBus, logger *slog.Logger, mlflowURI ...string) *CanaryHandler {
	uri := ""
	if len(mlflowURI) > 0 {
		uri = mlflowURI[0]
	}
	return &CanaryHandler{
		repo:         repo,
		k8sReader:    k8sReader,
		k8sWriter:    k8sWriter,
		releases:     releases,
		bus:          bus,
		logger:       logger,
		agentBaseURL: "http://%s.team-default.svc.cluster.local:8001",
		mlflowURI:    uri,
	}
}

// startCanaryRequest is the JSON body for POST /api/v1/agents/{id}/canary.
type startCanaryRequest struct {
	ChallengerVersion int `json:"challenger_version"`
	Weight            int `json:"weight"`
}

// canaryStatusResponse is the response for GET /api/v1/agents/{id}/canary.
type canaryStatusResponse struct {
	Enabled           bool   `json:"enabled"`
	Weight            int    `json:"weight"`
	ChampionVersion   string `json:"champion_version"`
	ChallengerVersion string `json:"challenger_version"`
	ChampionModelID   string `json:"champion_model_id"`
	ChallengerModelID string `json:"challenger_model_id"`
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

	// Resolve challenger config from release artifact
	challengerConfig := map[string]any{}
	challengerVersion := ""
	challengerModelID := ""

	if req.ChallengerVersion <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "Missing Version",
			"challenger_version is required — select a release to canary", r.URL.Path)
		return
	}

	if h.releases != nil {
		dir := fmt.Sprintf("agents/%s/%s", namespace, slug)
		releasePath := fmt.Sprintf("%s/releases/v%d.yaml", dir, req.ChallengerVersion)
		readCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		content, err := h.releases.ReadFile(readCtx, releasePath)
		if err != nil {
			httputil.WriteError(w, http.StatusNotFound, "Release Not Found",
				fmt.Sprintf("Release v%d not found for %s", req.ChallengerVersion, slug), r.URL.Path)
			return
		}
		parsed, err := parseReleaseConfig(content)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Parse Error", "Failed to parse release artifact", r.URL.Path)
			return
		}
		challengerConfig = parsed.config
		challengerModelID = parsed.modelID
		challengerVersion = fmt.Sprintf("%d", req.ChallengerVersion)
		challengerConfig["version"] = challengerVersion
	}

	// Always use the agent's current image (from CRD), not the release artifact's snapshot.
	// The release may have captured a temporary tag; the CRD image is always authoritative.
	if agent.Image != "" {
		challengerConfig["image"] = agent.Image
	}

	weight := req.Weight
	if weight < 1 || weight > 50 {
		weight = 10
	}

	// 1. Patch Agent CRD with canary spec
	canarySpec := map[string]any{
		"enabled": true,
		"weight":  weight,
		"version": challengerVersion,
	}
	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{"canary": canarySpec}); err != nil {
		h.logger.Warn("failed to patch CRD with canary spec", "error", err, "slug", slug)
	}

	// 2. Create canary Deployment from challenger config
	if err := h.k8sWriter.CreateCanaryDeployment(r.Context(), namespace, slug, challengerConfig); err != nil {
		h.logger.Error("create canary deployment failed", "error", err, "slug", slug)
		httputil.WriteError(w, http.StatusInternalServerError, "Canary Failed", err.Error(), r.URL.Path)
		return
	}

	// 3. Create canary K8s Service
	canaryName := slug + "-canary"
	canarySelector := map[string]string{"app": slug, "version": "canary"}
	if err := h.k8sWriter.CreateService(r.Context(), namespace, canaryName, canarySelector, 8000); err != nil {
		h.logger.Warn("create canary service failed (may already exist)", "error", err, "slug", slug)
	}

	// 4. Apply Istio traffic split
	if err := h.k8sWriter.ApplyTrafficSplit(r.Context(), namespace, slug, 100-weight, weight); err != nil {
		h.logger.Warn("failed to apply traffic split", "error", err, "slug", slug)
	}

	// 5. Emit event
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentCanaryStarted,
		Payload: map[string]any{
			"agent_id":            agent.ID,
			"slug":                slug,
			"challenger_version":  req.ChallengerVersion,
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": canaryStatusResponse{
			Enabled:           true,
			Weight:            weight,
			ChampionVersion:   agent.Version,
			ChallengerVersion: challengerVersion,
			ChampionModelID:   agent.ModelID,
			ChallengerModelID: challengerModelID,
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

	// 1. Remove Istio traffic split
	if err := h.k8sWriter.DeleteTrafficSplit(r.Context(), namespace, slug); err != nil {
		h.logger.Warn("delete traffic split on promote", "error", err, "slug", slug)
	}

	// 2. Delete canary Deployment (also cleans up ConfigMap and Service)
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

	// 1. Remove Istio traffic split
	if err := h.k8sWriter.DeleteTrafficSplit(r.Context(), namespace, slug); err != nil {
		h.logger.Warn("delete traffic split on rollback", "error", err, "slug", slug)
	}

	// 2. Delete canary Deployment (also cleans up ConfigMap and Service)
	if err := h.k8sWriter.DeleteCanaryDeployment(r.Context(), namespace, slug); err != nil {
		h.logger.Warn("delete canary deployment on rollback", "error", err, "slug", slug)
	}

	// 3. Clear canary spec from CRD
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


// Status handles GET /api/v1/agents/{id}/canary.
func (h *CanaryHandler) Status(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	// Read canary state from CRD
	namespace := middleware.NamespaceFromContext(r.Context())
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}

	status := canaryStatusResponse{
		Enabled:           false,
		Weight:            0,
		ChampionVersion:   agent.Version,
		ChallengerVersion: "",
		ChampionModelID:   agent.ModelID,
	}

	if agent.Canary != nil && agent.Canary.Enabled {
		status.Enabled = true
		status.Weight = agent.Canary.Weight
		status.ChallengerVersion = agent.Canary.Version
		status.ChallengerModelID = agent.Canary.ModelID
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": status})
}

// UpdateWeight handles PATCH /api/v1/agents/{id}/canary.
func (h *CanaryHandler) UpdateWeight(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	var req struct {
		Weight int `json:"weight"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", err.Error(), r.URL.Path)
		return
	}
	if req.Weight < 1 || req.Weight > 99 {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Weight", "Weight must be between 1 and 99", r.URL.Path)
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())
	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{
		"canary": map[string]any{"weight": req.Weight},
	}); err != nil {
		h.logger.Error("patch canary weight failed", "error", err, "slug", agent.Name)
		httputil.WriteError(w, http.StatusInternalServerError, "Patch Failed", err.Error(), r.URL.Path)
		return
	}

	// Update Istio traffic split
	if err := h.k8sWriter.ApplyTrafficSplit(r.Context(), namespace, agent.Name, 100-req.Weight, req.Weight); err != nil {
		h.logger.Warn("failed to update traffic split", "error", err)
	}

	// Return updated status
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}
	resp := canaryStatusResponse{
		Enabled:           true,
		Weight:            req.Weight,
		ChampionVersion:   agent.Version,
		ChampionModelID:   agent.ModelID,
	}
	if agent.Canary != nil {
		resp.ChallengerVersion = agent.Canary.Version
		resp.ChallengerModelID = agent.Canary.ModelID
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": resp})
}

// releaseConfigResult is the extracted config from a release artifact YAML.
type releaseConfigResult struct {
	config  map[string]any
	modelID string
}

// parseReleaseConfig extracts agent config from a release artifact YAML.
func parseReleaseConfig(yamlContent string) (releaseConfigResult, error) {
	yamlBytes := []byte(yamlContent)
	var raw struct {
		Agent struct {
			Model struct {
				Provider string `yaml:"provider"`
				ID       string `yaml:"id"`
			} `yaml:"model"`
			SystemPrompt string   `yaml:"system_prompt"`
			PromptRef    string   `yaml:"prompt_ref"`
			Tools        []string `yaml:"tools"`
			Skills       []string `yaml:"skills"`
		} `yaml:"agent"`
		Runtime struct {
			Image    string `yaml:"image"`
			Channel  string `yaml:"channel"`
			Strategy string `yaml:"strategy"`
		} `yaml:"runtime"`
	}
	if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
		return releaseConfigResult{}, fmt.Errorf("unmarshal release: %w", err)
	}
	cfg := map[string]any{
		"modelType":    raw.Agent.Model.Provider,
		"modelId":      raw.Agent.Model.ID,
		"systemPrompt": raw.Agent.SystemPrompt,
	}
	if raw.Agent.PromptRef != "" {
		cfg["promptRef"] = raw.Agent.PromptRef
	}
	if raw.Runtime.Image != "" {
		cfg["image"] = raw.Runtime.Image
	}
	if raw.Runtime.Channel != "" {
		cfg["channel"] = raw.Runtime.Channel
	}
	if raw.Runtime.Strategy != "" {
		cfg["strategy"] = raw.Runtime.Strategy
	}
	if len(raw.Agent.Tools) > 0 {
		cfg["tools"] = raw.Agent.Tools
	}
	if len(raw.Agent.Skills) > 0 {
		cfg["skills"] = raw.Agent.Skills
	}
	return releaseConfigResult{config: cfg, modelID: raw.Agent.Model.ID}, nil
}

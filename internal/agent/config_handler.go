package agent

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// ConfigHandler provides HTTP handlers for agent configuration updates.
type ConfigHandler struct {
	repo      Repository
	k8sReader K8sReader
	k8sWriter K8sWriter
	bus       *eventbus.EventBus
	logger    *slog.Logger
}

// NewConfigHandler creates a new ConfigHandler.
func NewConfigHandler(repo Repository, k8sReader K8sReader, k8sWriter K8sWriter, bus *eventbus.EventBus, logger *slog.Logger) *ConfigHandler {
	return &ConfigHandler{
		repo:      repo,
		k8sReader: k8sReader,
		k8sWriter: k8sWriter,
		bus:       bus,
		logger:    logger,
	}
}

// UpdateConfig handles PATCH /api/v1/agents/{id}/config.
// Creates a new release with the updated config WITHOUT deploying.
// The CRD is NOT patched — the user must click "Deploy" on the release.
func (h *ConfigHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	// Enrich agent with current CRD state so the release captures the full config
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}

	// Copy the enriched agent and apply changes to the copy — the CRD keeps the current config
	releaseAgent := *agent
	applyConfigToAgent(&releaseAgent, req)

	// Emit event with the modified copy — release handler will create a release from it
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentConfigChanged,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      agentSlug(agent),
			"changelog": "Config updated via dashboard",
			"agent":     &releaseAgent,
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent})
}

// applyConfigToAgent applies config changes to an in-memory Agent struct.
func applyConfigToAgent(a *Agent, req map[string]interface{}) {
	if v, ok := req["modelType"].(string); ok && v != "" {
		a.ModelType = v
	}
	if v, ok := req["modelId"].(string); ok && v != "" {
		a.ModelID = v
	}
	if v, ok := req["systemPrompt"].(string); ok {
		a.SystemPrompt = v
	}
	if v, ok := req["channel"].(string); ok && v != "" {
		a.Channel = v
	}
	if v, ok := req["strategy"].(string); ok && v != "" {
		a.Strategy = v
	}
	if v, ok := req["storage"].(string); ok && v != "" {
		a.Storage = v
	}
	if v, ok := req["image"].(string); ok && v != "" {
		a.Image = v
	}
	if v, ok := req["promptRef"].(string); ok {
		a.PromptRef = v
	}
	if v, ok := req["replicas"].(float64); ok {
		a.Replicas = int32(v)
	}
	if v, ok := req["tools"].([]interface{}); ok {
		tools := make([]string, len(v))
		for i, t := range v {
			tools[i], _ = t.(string)
		}
		a.Tools = tools
	}
	if v, ok := req["skills"].([]interface{}); ok {
		skills := make([]string, len(v))
		for i, s := range v {
			skills[i], _ = s.(string)
		}
		a.Skills = skills
	}
	if v, ok := req["knowledgeBases"].([]interface{}); ok {
		kbs := make([]string, len(v))
		for i, k := range v {
			kbs[i], _ = k.(string)
		}
		a.KnowledgeBases = kbs
	}
}

// UpdateSkills handles PUT /api/v1/agents/{id}/skills.
// Writes skills via the active Repository (K8sRepository patches the CRD,
// PostgresRepository updates the Config JSONB).
func (h *ConfigHandler) UpdateSkills(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	var req struct {
		Skills []string `json:"skills"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if err := h.repo.UpdateConfig(r.Context(), agent.ID, map[string]any{"skills": req.Skills}); err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
			return
		}
		h.logger.Error("update skills failed", "error", err, "agent", agent.ID)
		httputil.WriteError(w, http.StatusInternalServerError, "Update Failed", err.Error(), r.URL.Path)
		return
	}

	// When PostgresRepository is the store, also sync to K8s CRD.
	if !h.repo.IsK8sBacked() && h.k8sWriter != nil {
		_ = h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, map[string]any{"skills": req.Skills})
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentConfigChanged,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      agentSlug(agent),
			"changelog": "Skills updated",
		},
	})

	// Return updated agent
	refreshed, _ := h.repo.Get(r.Context(), agent.ID)
	if refreshed != nil && h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), refreshed, namespace)
	}
	if refreshed == nil {
		refreshed = agent
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": refreshed})
}

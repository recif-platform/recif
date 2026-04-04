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
// Updates the Agent CRD spec in Kubernetes and persists to DB.
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

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot update CRD without K8s connection", r.URL.Path)
		return
	}

	if err := h.k8sWriter.PatchSpec(r.Context(), namespace, agent.Name, req); err != nil {
		h.logger.Error("patch CRD failed", "error", err, "agent", agent.Name)
		httputil.WriteError(w, http.StatusInternalServerError, "Update Failed", err.Error(), r.URL.Path)
		return
	}

	// Also persist to DB (Config JSONB) so BuildArtifact reads the latest state
	dbUpdates := MapRequestToDB(req)
	if len(dbUpdates) > 0 {
		if err := h.repo.UpdateConfig(r.Context(), agent.ID, dbUpdates); err != nil {
			h.logger.Warn("failed to persist config to DB", "error", err, "agent", agent.ID)
		}
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentConfigChanged,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      agentSlug(agent),
			"changelog": "Config updated via dashboard",
		},
	})

	// Re-fetch enriched agent
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent})
}

// UpdateSkills handles PUT /api/v1/agents/{id}/skills.
// Persists skills directly in the DB Config JSONB -- no K8s dependency.
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

	// Also try to sync to CRD if K8s is available (best effort)
	if h.k8sWriter != nil {
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

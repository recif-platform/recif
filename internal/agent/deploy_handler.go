package agent

import (
	"log/slog"
	"net/http"

	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// DeployHandler provides HTTP handlers for agent deployment lifecycle.
type DeployHandler struct {
	repo      Repository
	k8sReader K8sReader
	k8sWriter K8sWriter
	bus       *eventbus.EventBus
	logger    *slog.Logger
}

// NewDeployHandler creates a new DeployHandler.
func NewDeployHandler(repo Repository, k8sReader K8sReader, k8sWriter K8sWriter, bus *eventbus.EventBus, logger *slog.Logger) *DeployHandler {
	return &DeployHandler{
		repo:      repo,
		k8sReader: k8sReader,
		k8sWriter: k8sWriter,
		bus:       bus,
		logger:    logger,
	}
}

// Deploy handles POST /api/v1/agents/{id}/deploy.
// Creates the Agent CRD if it doesn't exist, or scales replicas to 1.
func (h *DeployHandler) Deploy(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot deploy without K8s connection", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	spec := BuildCRDSpec(agent)

	if h.k8sReader != nil && h.k8sReader.AgentCRDExists(r.Context(), namespace, slug) {
		// CRD exists -- update spec and ensure running
		if err := h.k8sWriter.PatchSpec(r.Context(), namespace, slug, spec); err != nil {
			h.logger.Warn("patch CRD spec failed", "error", err, "slug", slug)
		}
		if err := h.k8sWriter.ScaleAgent(r.Context(), namespace, slug, 1); err != nil {
			h.logger.Error("scale agent failed", "error", err, "slug", slug)
			httputil.WriteError(w, http.StatusInternalServerError, "Deploy Failed", err.Error(), r.URL.Path)
			return
		}
	} else {
		// Create CRD from DB config
		if err := h.k8sWriter.CreateAgentCRD(r.Context(), namespace, slug, spec); err != nil {
			h.logger.Error("create CRD failed", "error", err, "slug", slug)
			httputil.WriteError(w, http.StatusInternalServerError, "Deploy Failed", err.Error(), r.URL.Path)
			return
		}
	}

	// Update DB status to deployed
	agent.Status = StatusDeployed
	if _, err := h.repo.Update(r.Context(), agent); err != nil {
		h.logger.Warn("failed to update agent status after deploy", "error", err)
	}

	// Emit deploy event (release handler subscribes to this)
	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentDeployed,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      slug,
			"changelog": "Deployed via dashboard",
		},
	})

	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent, "action": "deployed"})
}

// Stop handles POST /api/v1/agents/{id}/stop.
// Scales replicas to 0 on the Agent CRD.
func (h *DeployHandler) Stop(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot stop without K8s connection", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	if err := h.k8sWriter.ScaleAgent(r.Context(), namespace, slug, 0); err != nil {
		h.logger.Error("stop agent failed", "error", err, "slug", slug)
		httputil.WriteError(w, http.StatusInternalServerError, "Stop Failed", err.Error(), r.URL.Path)
		return
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentStopped,
		Payload: map[string]any{
			"agent_id": agent.ID,
			"slug":     slug,
		},
	})

	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent, "action": "stopped"})
}

// Restart handles POST /api/v1/agents/{id}/restart.
// Deletes the pod so K8s auto-recreates it from the deployment.
func (h *DeployHandler) Restart(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sWriter == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "K8s Not Available", "Cannot restart without K8s connection", r.URL.Path)
		return
	}

	slug := agentSlug(agent)

	if err := h.k8sWriter.DeleteAgentPod(r.Context(), namespace, slug); err != nil {
		h.logger.Error("restart agent failed", "error", err, "slug", slug)
		httputil.WriteError(w, http.StatusInternalServerError, "Restart Failed", err.Error(), r.URL.Path)
		return
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentRestarted,
		Payload: map[string]any{
			"agent_id": agent.ID,
			"slug":     slug,
		},
	})

	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent, "action": "restarted"})
}

// Events handles GET /api/v1/agents/{id}/events.
// Returns K8s events for this agent's resources.
func (h *DeployHandler) Events(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		// Return empty events on error (graceful degradation)
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	if h.k8sReader == nil {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	slug := agentSlug(agent)

	events, err := h.k8sReader.GetEvents(r.Context(), namespace, slug)
	if err != nil {
		h.logger.Warn("failed to fetch events", "error", err, "slug", slug)
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": events})
}

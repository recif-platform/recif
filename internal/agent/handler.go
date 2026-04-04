package agent

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

var validate = validator.New()

// CreateAgentRequest is the JSON body for POST /api/v1/agents.
type CreateAgentRequest struct {
	Name         string          `json:"name" validate:"required,min=1,max=255"`
	Framework    string          `json:"framework" validate:"required,oneof=corail langchain crewai autogen"`
	Description  string          `json:"description" validate:"max=500"`
	Version      string          `json:"version" validate:"required,min=1,max=20"`
	ModelType    string          `json:"model_type" validate:"omitempty,oneof=stub ollama openai anthropic vertex-ai bedrock google-ai"`
	ModelID      string          `json:"model_id" validate:"max=100"`
	SystemPrompt string          `json:"system_prompt"`
	Strategy     string          `json:"strategy"`
	Channel      string          `json:"channel"`
	Storage      string          `json:"storage"`
	Image        string          `json:"image"`
	Tools               []string        `json:"tools"`
	Skills              []string        `json:"skills"`
	SuggestionsProvider string          `json:"suggestions_provider"`
	Suggestions         string          `json:"suggestions"`
	EvalSampleRate      int32           `json:"eval_sample_rate"`
	JudgeModel          string          `json:"judge_model"`
	Config              json.RawMessage `json:"config"`
}

// Handler provides HTTP handlers for agent CRUD operations.
type Handler struct {
	repo      Repository
	bus       *eventbus.EventBus
	k8sReader K8sReader
	k8sWriter K8sWriter
	logger    *slog.Logger
}

// NewHandler creates a new agent Handler.
func NewHandler(repo Repository, bus *eventbus.EventBus, k8sReader K8sReader, k8sWriter K8sWriter, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, bus: bus, k8sReader: k8sReader, k8sWriter: k8sWriter, logger: logger}
}

// Create handles POST /api/v1/agents.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return
	}
	var req CreateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if err := validate.Struct(req); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", httputil.FormatValidationErrors(err), r.URL.Path)
		return
	}

	slug := httputil.Slugify(req.Name)
	teamID := middleware.TeamFromContext(r.Context())
	config := MergeAllFieldsIntoConfig(req)

	// Check if agent already exists (re-registration = new version)
	existing, err := h.repo.GetBySlug(r.Context(), teamID, slug)
	if err != nil && err != ErrNotFound {
		h.logger.Error("check existing agent failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to check existing agent", r.URL.Path)
		return
	}

	if existing != nil {
		// Re-registration: update agent + create new version
		existing.Name = req.Name
		existing.Description = req.Description
		existing.Framework = req.Framework
		existing.Version = req.Version
		existing.Config = config
		updated, err := h.repo.Update(r.Context(), existing)
		if err != nil {
			h.logger.Error("update agent failed", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to update agent", r.URL.Path)
			return
		}

		_, err = h.repo.CreateVersion(r.Context(), AgentVersion{
			ID:      "av_" + ulid.Make().String(),
			AgentID: existing.ID,
			Version: req.Version,
			Config:  config,
		})
		if err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				httputil.WriteError(w, http.StatusConflict, "Version Conflict", "Version "+req.Version+" already exists for this agent", r.URL.Path)
				return
			}
			h.logger.Error("create version failed", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create version", r.URL.Path)
			return
		}

		h.bus.Emit(r.Context(), eventbus.Event{
			Type: eventbus.AgentConfigChanged,
			Payload: map[string]any{
				"agent_id":  existing.ID,
				"slug":      slug,
				"changelog": "Re-registered with version " + req.Version,
			},
		})

		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": updated})
		return
	}

	// New agent
	agent, err := h.repo.Create(r.Context(), CreateParams{
		ID:          "ag_" + ulid.Make().String(),
		TeamID:      teamID,
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		Status:      StatusRegistered,
		Framework:   req.Framework,
		Version:     req.Version,
		Config:      config,
	})
	if err != nil {
		h.logger.Error("create agent failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create agent", r.URL.Path)
		return
	}

	// Create first version
	if _, err := h.repo.CreateVersion(r.Context(), AgentVersion{
		ID:      "av_" + ulid.Make().String(),
		AgentID: agent.ID,
		Version: req.Version,
		Config:  config,
	}); err != nil {
		h.logger.Error("create first version failed", "error", err, "agent_id", agent.ID)
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentCreated,
		Payload: map[string]any{
			"agent_id":  agent.ID,
			"slug":      slug,
			"changelog": "Initial registration",
		},
	})

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": agent})
}

// List handles GET /api/v1/agents.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return
	}
	search := r.URL.Query().Get("search")
	namespace := middleware.NamespaceFromContext(r.Context())

	var agents []Agent
	var err error
	if search != "" {
		agents, err = h.repo.Search(r.Context(), search, 100, 0)
	} else {
		agents, err = h.repo.ListAll(r.Context(), 100, 0)
	}
	if err != nil {
		h.logger.Error("list agents failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list agents", r.URL.Path)
		return
	}

	// Enrich with K8s CRD data
	if h.k8sReader != nil {
		ptrs := make([]*Agent, len(agents))
		for i := range agents {
			ptrs[i] = &agents[i]
		}
		h.k8sReader.EnrichAll(r.Context(), ptrs, namespace)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agents})
}

// Get handles GET /api/v1/agents/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return
	}
	id := chi.URLParam(r, "id")
	namespace := middleware.NamespaceFromContext(r.Context())

	agent, err := h.repo.Get(r.Context(), id)
	if err != nil {
		if err == ErrNotFound {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
			return
		}
		h.logger.Error("get agent failed", "error", err, "id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get agent", r.URL.Path)
		return
	}

	// Enrich with K8s CRD data
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(r.Context(), agent, namespace)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": agent})
}

// ListVersions handles GET /api/v1/agents/{id}/versions.
func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return
	}
	id := chi.URLParam(r, "id")
	versions, err := h.repo.ListVersions(r.Context(), id)
	if err != nil {
		h.logger.Error("list versions failed", "error", err, "agent_id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list versions", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": versions})
}

// UpdateStatus handles PATCH /api/v1/agents/{id}/status.
func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return
	}
	id := chi.URLParam(r, "id")

	var req struct {
		Status string `json:"status" validate:"required"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	agent, err := h.repo.Get(r.Context(), id)
	if err != nil {
		if err == ErrNotFound {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get agent", r.URL.Path)
		return
	}

	nextStatus := AgentStatus(req.Status)
	if err := ValidateTransition(agent.Status, nextStatus); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Invalid Transition", err.Error(), r.URL.Path)
		return
	}

	agent.Status = nextStatus
	updated, err := h.repo.Update(r.Context(), agent)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to update status", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": updated})
}

// resolveAgent fetches an agent by the URL param {id}. Writes errors and returns false on failure.
func resolveAgent(repo Repository, logger *slog.Logger, w http.ResponseWriter, r *http.Request) (*Agent, bool) {
	if repo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return nil, false
	}
	id := chi.URLParam(r, "id")
	agent, err := repo.Get(r.Context(), id)
	if err != nil {
		if err == ErrNotFound {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
			return nil, false
		}
		logger.Error("get agent failed", "error", err, "id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get agent", r.URL.Path)
		return nil, false
	}
	return agent, true
}

// Delete handles DELETE /api/v1/agents/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	agent, ok := resolveAgent(h.repo, h.logger, w, r)
	if !ok {
		return
	}

	slug := agentSlug(agent)
	namespace := middleware.NamespaceFromContext(r.Context())

	// Delete K8s CRD (operator will clean up Deployment, Service, ConfigMap)
	if h.k8sWriter != nil && h.k8sReader != nil && h.k8sReader.AgentCRDExists(r.Context(), namespace, slug) {
		if err := h.k8sWriter.DeleteAgentCRD(r.Context(), namespace, slug); err != nil {
			h.logger.Warn("failed to delete agent CRD", "error", err, "slug", slug)
		}
	}

	// Delete from DB
	if err := h.repo.Delete(r.Context(), agent.ID); err != nil {
		h.logger.Error("delete agent failed", "error", err, "id", agent.ID)
		httputil.WriteError(w, http.StatusInternalServerError, "Delete Failed", "Failed to delete agent", r.URL.Path)
		return
	}

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.AgentDeleted,
		Payload: map[string]any{"agent_id": agent.ID, "agent_slug": slug, "namespace": namespace},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": agent.ID})
}

// agentSlug returns the slug for an agent, deriving from name if empty.
func agentSlug(ag *Agent) string {
	if ag.Slug != "" {
		return ag.Slug
	}
	return httputil.Slugify(ag.Name)
}

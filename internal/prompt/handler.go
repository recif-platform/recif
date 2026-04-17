package prompt

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/sciences44/recif/internal/httputil"
)

// Handler provides HTTP handlers for prompt management via MLflow Prompt Registry.
type Handler struct {
	client *MLflowClient
	logger *slog.Logger
}

// NewHandler creates a new prompt Handler.
func NewHandler(mlflowURI string, logger *slog.Logger) *Handler {
	return &Handler{
		client: NewMLflowClient(mlflowURI),
		logger: logger,
	}
}

// CreateRequest is the payload for POST /api/v1/prompts.
type CreateRequest struct {
	Name          string            `json:"name"`
	Template      string            `json:"template"`
	CommitMessage string            `json:"commit_message"`
	Tags          map[string]string `json:"tags,omitempty"`
}

// AliasRequest is the payload for POST /api/v1/prompts/{name}/aliases.
type AliasRequest struct {
	Alias   string `json:"alias"`
	Version int    `json:"version"`
}

// List handles GET /api/v1/prompts — returns all prompts from MLflow.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	filter := r.URL.Query().Get("filter")
	data, err := h.client.SearchPrompts(r.Context(), filter, 100)
	if err != nil {
		h.logger.Error("failed to list prompts", "error", err)
		httputil.WriteError(w, http.StatusBadGateway, "MLflow Error", "Failed to list prompts from MLflow", r.URL.Path)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, data)
}

// Create handles POST /api/v1/prompts — creates or versions a prompt.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}
	if req.Name == "" || req.Template == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "name and template are required", r.URL.Path)
		return
	}

	data, err := h.client.RegisterPrompt(r.Context(), req.Name, req.Template, req.CommitMessage, req.Tags)
	if err != nil {
		h.logger.Error("failed to create prompt", "error", err)
		httputil.WriteError(w, http.StatusBadGateway, "MLflow Error", "Failed to create prompt", r.URL.Path)
		return
	}

	h.logger.Info("prompt created", "name", req.Name)
	httputil.WriteJSON(w, http.StatusCreated, data)
}

// Get handles GET /api/v1/prompts/{name} — returns prompt with all versions.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	data, err := h.client.GetPrompt(r.Context(), name)
	if err != nil {
		h.logger.Error("failed to get prompt", "error", err, "name", name)
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Prompt not found", r.URL.Path)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, data)
}

// GetVersion handles GET /api/v1/prompts/{name}/versions/{version}.
func (h *Handler) GetVersion(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	version, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "version must be a number", r.URL.Path)
		return
	}

	data, err := h.client.GetPromptVersion(r.Context(), name, version)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Prompt version not found", r.URL.Path)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, data)
}

// SetAlias handles POST /api/v1/prompts/{name}/aliases.
func (h *Handler) SetAlias(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	var req AliasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}
	if req.Alias == "" || req.Version < 1 {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "alias and version (>=1) are required", r.URL.Path)
		return
	}

	data, err := h.client.SetAlias(r.Context(), name, req.Alias, req.Version)
	if err != nil {
		h.logger.Error("failed to set alias", "error", err, "name", name, "alias", req.Alias)
		httputil.WriteError(w, http.StatusBadGateway, "MLflow Error", "Failed to set alias", r.URL.Path)
		return
	}

	h.logger.Info("prompt alias set", "name", name, "alias", req.Alias, "version", req.Version)
	httputil.WriteJSON(w, http.StatusOK, data)
}

// DeleteAlias handles DELETE /api/v1/prompts/{name}/aliases/{alias}.
func (h *Handler) DeleteAlias(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	alias := chi.URLParam(r, "alias")

	if err := h.client.DeleteAlias(r.Context(), name, alias); err != nil {
		h.logger.Error("failed to delete alias", "error", err, "name", name, "alias", alias)
		httputil.WriteError(w, http.StatusBadGateway, "MLflow Error", "Failed to delete alias", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "Alias deleted"})
}

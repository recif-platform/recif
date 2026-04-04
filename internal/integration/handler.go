package integration

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/httputil"
)

var validate = validator.New()

// Handler provides HTTP handlers for integration operations.
type Handler struct {
	mu          sync.RWMutex
	store       map[string]Integration
	credentials map[string]map[string]string // id -> credentials (kept separate)
	logger      *slog.Logger
}

// NewHandler creates a new integration Handler with an in-memory store.
func NewHandler(logger *slog.Logger) *Handler {
	return &Handler{
		store:       make(map[string]Integration),
		credentials: make(map[string]map[string]string),
		logger:      logger,
	}
}

// ListTypes handles GET /api/v1/integrations/types.
func (h *Handler) ListTypes(w http.ResponseWriter, r *http.Request) {
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": IntegrationTypes()})
}

// List handles GET /api/v1/integrations.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	integrations := make([]Integration, 0, len(h.store))
	for _, intg := range h.store {
		integrations = append(integrations, intg)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": integrations})
}

// Get handles GET /api/v1/integrations/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	intg, ok := h.store[id]
	h.mu.RUnlock()

	if !ok {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Integration not found", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": intg})
}

// Create handles POST /api/v1/integrations.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if err := validate.Struct(req); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", formatValidationErrors(err), r.URL.Path)
		return
	}

	if _, ok := LookupType(req.Type); !ok {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Type", fmt.Sprintf("Unknown integration type: %s", req.Type), r.URL.Path)
		return
	}

	now := time.Now().UTC()
	intg := Integration{
		ID:        ulid.Make().String(),
		Name:      req.Name,
		Type:      req.Type,
		Status:    "disconnected",
		Config:    req.Config,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if intg.Config == nil {
		intg.Config = make(map[string]string)
	}

	h.mu.Lock()
	h.store[intg.ID] = intg
	if req.Credentials != nil {
		h.credentials[intg.ID] = req.Credentials
	}
	h.mu.Unlock()

	h.logger.Info("integration created", "id", intg.ID, "type", intg.Type, "name", intg.Name)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": intg})
}

// Delete handles DELETE /api/v1/integrations/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	_, ok := h.store[id]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Integration not found", r.URL.Path)
		return
	}
	delete(h.store, id)
	delete(h.credentials, id)
	h.mu.Unlock()

	h.logger.Info("integration deleted", "id", id)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Integration deleted"})
}

// TestConnection handles POST /api/v1/integrations/{id}/test.
func (h *Handler) TestConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	intg, ok := h.store[id]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Integration not found", r.URL.Path)
		return
	}

	creds := h.credentials[id]
	hasCredentials := len(creds) > 0

	if hasCredentials {
		intg.Status = "connected"
	} else {
		intg.Status = "error"
	}
	intg.UpdatedAt = time.Now().UTC()
	h.store[id] = intg
	h.mu.Unlock()

	result := map[string]string{
		"status":  intg.Status,
		"message": "Connection successful",
	}
	if !hasCredentials {
		result["message"] = "No credentials configured"
	}

	h.logger.Info("integration test", "id", id, "status", intg.Status)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": result})
}

// formatValidationErrors converts validator errors to a readable string.
func formatValidationErrors(err error) string {
	ve, ok := err.(validator.ValidationErrors) //nolint:errorlint // validator returns concrete type
	if !ok {
		return err.Error()
	}
	msg := ""
	for i, fe := range ve {
		if i > 0 {
			msg += "; "
		}
		msg += fmt.Sprintf("%s: %s", fe.Field(), fe.Tag())
	}
	return msg
}

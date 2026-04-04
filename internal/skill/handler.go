package skill

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/httputil"
)

// Handler provides HTTP handlers for skill operations.
type Handler struct {
	mu     sync.RWMutex
	store  map[string]Skill
	logger *slog.Logger
}

// NewHandler creates a new skill Handler with an in-memory store pre-loaded with built-in skills.
func NewHandler(logger *slog.Logger) *Handler {
	return &Handler{
		store:  make(map[string]Skill),
		logger: logger,
	}
}

// List handles GET /api/v1/skills.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	skills := make([]Skill, 0, len(builtinSkills)+len(h.store))
	skills = append(skills, builtinSkills...)
	for _, s := range h.store {
		skills = append(skills, s)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": skills})
}

// Create handles POST /api/v1/skills.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "name is required", r.URL.Path)
		return
	}

	now := time.Now().UTC()
	s := Skill{
		ID:            ulid.Make().String(),
		Name:          req.Name,
		Description:   req.Description,
		Instructions:  req.Instructions,
		Category:      req.Category,
		Version:       req.Version,
		Author:        req.Author,
		Source:        "custom",
		Compatibility: req.Compatibility,
		ChannelFilter: req.ChannelFilter,
		Tools:         req.Tools,
		Scripts:       req.Scripts,
		References:    req.References,
		Builtin:       false,
		CreatedAt:     now,
	}

	if s.Compatibility == nil {
		s.Compatibility = []string{}
	}
	if s.ChannelFilter == nil {
		s.ChannelFilter = []string{}
	}
	if s.Tools == nil {
		s.Tools = []string{}
	}
	if s.Category == "" {
		s.Category = "general"
	}
	if s.Version == "" {
		s.Version = "1.0.0"
	}

	h.mu.Lock()
	h.store[s.ID] = s
	h.mu.Unlock()

	h.logger.Info("skill created", "id", s.ID, "name", s.Name)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": s})
}

// Update handles PUT /api/v1/skills/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Prevent updating built-in skills.
	for _, b := range builtinSkills {
		if b.ID == id {
			httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Cannot update a built-in skill", r.URL.Path)
			return
		}
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	existing, ok := h.store[id]
	if !ok {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Skill not found", r.URL.Path)
		return
	}

	var req CreateParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Instructions != "" {
		existing.Instructions = req.Instructions
	}
	if req.Category != "" {
		existing.Category = req.Category
	}
	if req.Version != "" {
		existing.Version = req.Version
	}
	if req.Author != "" {
		existing.Author = req.Author
	}
	if req.ChannelFilter != nil {
		existing.ChannelFilter = req.ChannelFilter
	}
	if req.Tools != nil {
		existing.Tools = req.Tools
	}
	if req.Scripts != nil {
		existing.Scripts = req.Scripts
	}
	if req.References != nil {
		existing.References = req.References
	}

	h.store[id] = existing

	h.logger.Info("skill updated", "id", id)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": existing})
}

// Delete handles DELETE /api/v1/skills/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Prevent deleting built-in skills.
	for _, b := range builtinSkills {
		if b.ID == id {
			httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Cannot delete a built-in skill", r.URL.Path)
			return
		}
	}

	h.mu.Lock()
	_, ok := h.store[id]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Skill not found", r.URL.Path)
		return
	}
	delete(h.store, id)
	h.mu.Unlock()

	h.logger.Info("skill deleted", "id", id)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Skill deleted"})
}

// Import handles POST /api/v1/skills/import.
// Parses the source string and creates a skill from the metadata.
// Real GitHub fetching is deferred -- this returns a mock skill based on the source.
func (h *Handler) Import(w http.ResponseWriter, r *http.Request) {
	var req ImportParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.Source == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "source is required", r.URL.Path)
		return
	}

	// Parse skill name from source
	skillName := req.Source
	if strings.HasPrefix(req.Source, "github:") {
		ref := strings.TrimPrefix(req.Source, "github:")
		parts := strings.Split(ref, "/")
		if len(parts) >= 3 {
			skillName = parts[len(parts)-1]
		}
	}

	now := time.Now().UTC()
	s := Skill{
		ID:            ulid.Make().String(),
		Name:          skillName,
		Description:   fmt.Sprintf("Imported skill from %s", req.Source),
		Instructions:  fmt.Sprintf("Skill imported from %s. Full instructions will be fetched on activation.", req.Source),
		Category:      "general",
		Version:       "1.0.0",
		Author:        "",
		Source:        req.Source,
		Compatibility: []string{},
		ChannelFilter: []string{},
		Tools:         []string{},
		Builtin:       false,
		CreatedAt:     now,
	}

	h.mu.Lock()
	h.store[s.ID] = s
	h.mu.Unlock()

	h.logger.Info("skill imported", "id", s.ID, "name", s.Name, "source", req.Source)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": s})
}

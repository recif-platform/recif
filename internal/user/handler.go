package user

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/oklog/ulid/v2"

	"github.com/sciences44/recif/internal/httputil"
)

// CreateUserRequest is the payload for POST /api/v1/users.
type CreateUserRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// Handler provides HTTP handlers for user administration.
type Handler struct {
	repo    *Repository
	logger  *slog.Logger
	isAdmin func(ctx context.Context) bool
}

// NewHandler creates a new user Handler.
func NewHandler(repo *Repository, logger *slog.Logger, isAdmin func(context.Context) bool) *Handler {
	return &Handler{repo: repo, logger: logger, isAdmin: isAdmin}
}

// List handles GET /api/v1/users — returns all platform users (admin only).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if !h.isAdmin(r.Context()) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Admin access required", r.URL.Path)
		return
	}

	users, err := h.repo.List(r.Context())
	if err != nil {
		h.logger.Error("failed to list users", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list users", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": users})
}

// Create handles POST /api/v1/users — creates a new platform user (admin only).
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.isAdmin(r.Context()) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Admin access required", r.URL.Path)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}

	email := strings.TrimSpace(req.Email)
	name := strings.TrimSpace(req.Name)
	password := req.Password
	role := strings.TrimSpace(req.Role)

	if email == "" || !strings.Contains(email, "@") {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "A valid email is required", r.URL.Path)
		return
	}
	if name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Name is required", r.URL.Path)
		return
	}
	if len(password) < 8 {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Password must be at least 8 characters", r.URL.Path)
		return
	}
	if role == "" {
		role = "developer"
	}

	id := fmt.Sprintf("us_%s", ulid.Make().String())
	u, err := h.repo.Create(r.Context(), id, email, name, role, password)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "23505") {
			httputil.WriteError(w, http.StatusConflict, "Conflict", "A user with this email already exists", r.URL.Path)
			return
		}
		h.logger.Error("failed to create user", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create user", r.URL.Path)
		return
	}

	h.logger.Info("user created", "id", id, "email", email, "role", role)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": u})
}

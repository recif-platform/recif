package user

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/sciences44/recif/internal/httputil"
)

// Handler provides HTTP handlers for user administration.
type Handler struct {
	repo    *Repository
	logger  *slog.Logger
	isAdmin func(ctx context.Context) bool
}

// NewHandler creates a new user Handler.
// isAdmin is injected to avoid a circular import with the auth/middleware packages.
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

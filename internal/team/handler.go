package team

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/sciences44/recif/internal/auth"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// validRoles is the set of allowed member roles.
var validRoles = map[string]bool{
	auth.RoleAdmin:     true,
	auth.RoleDeveloper: true,
	auth.RoleViewer:    true,
}

// Handler provides HTTP handlers for team operations.
type Handler struct {
	repo   Repository
	k8s    kubernetes.Interface
	logger *slog.Logger
}

// NewHandler creates a new team Handler backed by a Repository.
func NewHandler(repo Repository, logger *slog.Logger) *Handler {
	h := &Handler{repo: repo, logger: logger}
	// Build K8s client for namespace management.
	cfg, err := rest.InClusterConfig()
	if err != nil {
		home := clientcmd.RecommendedHomeFile
		cfg, err = clientcmd.BuildConfigFromFlags("", home)
	}
	if err == nil {
		h.k8s, _ = kubernetes.NewForConfig(cfg)
	}
	if h.k8s == nil {
		logger.Warn("K8s client unavailable — team namespaces will not be created automatically")
	}
	return h
}

// List handles GET /api/v1/teams.
// Platform admins see all teams; others see only their own team.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	teams, err := h.repo.List(r.Context())
	if err != nil {
		h.logger.Error("list teams failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list teams", r.URL.Path)
		return
	}

	// Non-admins see only their own team.
	if !auth.IsAdmin(auth.GetClaims(r.Context())) {
		teamID := middleware.TeamFromContext(r.Context())
		filtered := make([]*Team, 0, 1)
		for _, t := range teams {
			if t.ID == teamID {
				filtered = append(filtered, t)
			}
		}
		teams = filtered
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": teams})
}

// Create handles POST /api/v1/teams.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if !auth.IsAdmin(auth.GetClaims(r.Context())) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Only admins can create teams", r.URL.Path)
		return
	}

	var req CreateTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 100 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "name is required and must be 1-100 characters", r.URL.Path)
		return
	}

	id := fmt.Sprintf("tk_%s", ulid.Make().String())
	slug := httputil.Slugify(name)

	team, err := h.repo.Create(r.Context(), id, name, slug, strings.TrimSpace(req.Description))
	if err != nil {
		h.logger.Error("create team failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create team", r.URL.Path)
		return
	}

	// Create the K8s namespace for this team.
	h.ensureNamespace(r.Context(), team.Namespace)

	h.logger.Info("team created", "id", id, "name", name, "namespace", team.Namespace)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": team})
}

// Get handles GET /api/v1/teams/{teamId}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	team, err := h.repo.Get(r.Context(), teamID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
			return
		}
		h.logger.Error("get team failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get team", r.URL.Path)
		return
	}

	members, err := h.repo.ListMembers(r.Context(), teamID)
	if err != nil {
		h.logger.Error("list members failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list members", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"team":    team,
		"members": members,
	})
}

// Delete handles DELETE /api/v1/teams/{teamId}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if !auth.IsAdmin(auth.GetClaims(r.Context())) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Only admins can delete teams", r.URL.Path)
		return
	}

	teamID := chi.URLParam(r, "teamId")
	if teamID == auth.DefaultTeamID {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Cannot delete the default team", r.URL.Path)
		return
	}

	// Get team BEFORE deleting from DB — we need the namespace for K8s cleanup.
	team, _ := h.repo.Get(r.Context(), teamID)

	if err := h.repo.Delete(r.Context(), teamID); err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
			return
		}
		h.logger.Error("delete team failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to delete team", r.URL.Path)
		return
	}

	// Delete the K8s namespace (cascades all resources inside it).
	if team != nil && team.Namespace != "" && team.Namespace != "team-default" {
		h.deleteNamespace(r.Context(), team.Namespace)
	}

	h.logger.Info("team deleted", "id", teamID)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Team deleted"})
}

// AddMember handles POST /api/v1/teams/{teamId}/members.
func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	if !h.canManageTeam(r.Context(), teamID) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Insufficient permissions to manage this team", r.URL.Path)
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	email := strings.TrimSpace(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "a valid email is required", r.URL.Path)
		return
	}
	role := strings.TrimSpace(req.Role)
	if !validRoles[role] {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "role must be admin, developer, or viewer", r.URL.Path)
		return
	}

	// Resolve email to user_id (the user must exist in the platform).
	userID, err := h.repo.GetUserIDByEmail(r.Context(), email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "Not Found", "No user with this email", r.URL.Path)
			return
		}
		h.logger.Error("lookup user by email failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to look up user", r.URL.Path)
		return
	}

	membershipID := fmt.Sprintf("tm_%s", ulid.Make().String())
	if err := h.repo.AddMember(r.Context(), membershipID, userID, teamID, role); err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "23505") {
			httputil.WriteError(w, http.StatusConflict, "Conflict", "User already a member of this team", r.URL.Path)
			return
		}
		h.logger.Error("add member failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to add member", r.URL.Path)
		return
	}

	h.logger.Info("member added to team", "team_id", teamID, "email", email, "role", role)
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": TeamMember{
		UserID: userID,
		Email:  email,
		Role:   role,
	}})
}

// RemoveMember handles DELETE /api/v1/teams/{teamId}/members/{userId}.
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")
	userID := chi.URLParam(r, "userId")

	if !h.canManageTeam(r.Context(), teamID) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Insufficient permissions to manage this team", r.URL.Path)
		return
	}

	if err := h.repo.RemoveMember(r.Context(), teamID, userID); err != nil {
		h.logger.Error("remove member failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to remove member", r.URL.Path)
		return
	}

	h.logger.Info("member removed from team", "team_id", teamID, "user_id", userID)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Member removed"})
}

// UpdateMemberRole handles PATCH /api/v1/teams/{teamId}/members/{userId}.
func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")
	userID := chi.URLParam(r, "userId")

	if !h.canManageTeam(r.Context(), teamID) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Insufficient permissions to manage this team", r.URL.Path)
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	role := strings.TrimSpace(req.Role)
	if !validRoles[role] {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "role must be admin, developer, or viewer", r.URL.Path)
		return
	}

	if err := h.repo.UpdateMemberRole(r.Context(), teamID, userID, role); err != nil {
		h.logger.Error("update member role failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to update role", r.URL.Path)
		return
	}

	h.logger.Info("member role updated", "team_id", teamID, "user_id", userID, "role", role)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Role updated"})
}

// canManageTeam checks if the caller is a platform admin or an admin of the given team.
func (h *Handler) canManageTeam(ctx context.Context, teamID string) bool {
	claims := auth.GetClaims(ctx)
	if claims == nil {
		return false
	}
	if auth.IsAdmin(claims) {
		return true
	}
	// Only team admins can manage their own team.
	role, err := h.repo.GetMemberRole(ctx, teamID, claims.UserID)
	if err != nil {
		return false
	}
	return role == auth.RoleAdmin
}

// ensureNamespace creates a K8s namespace if it doesn't already exist.
func (h *Handler) ensureNamespace(ctx context.Context, ns string) {
	if h.k8s == nil {
		return
	}
	_, err := h.k8s.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   ns,
			Labels: map[string]string{"recif.dev/managed": "true"},
		},
	}, metav1.CreateOptions{})
	if err != nil {
		if k8serrors.IsAlreadyExists(err) {
			return
		}
		h.logger.Warn("failed to create namespace", "namespace", ns, "error", err)
	}
}

// deleteNamespace deletes a K8s namespace (cascades all resources inside it).
func (h *Handler) deleteNamespace(ctx context.Context, ns string) {
	if h.k8s == nil {
		return
	}
	if err := h.k8s.CoreV1().Namespaces().Delete(ctx, ns, metav1.DeleteOptions{}); err != nil {
		if !k8serrors.IsNotFound(err) {
			h.logger.Warn("failed to delete namespace", "namespace", ns, "error", err)
		}
	} else {
		h.logger.Info("namespace deleted", "namespace", ns)
	}
}

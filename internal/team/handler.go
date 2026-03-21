package team

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
	"github.com/sciences44/recif/internal/server/middleware"
)

const (
	defaultTeamID    = "tk_DEFAULT000000000000000000"
	defaultNamespace = "team-default"
)

// validRoles is the set of allowed member roles.
var validRoles = map[string]bool{
	"admin":     true,
	"developer": true,
	"viewer":    true,
}

// Handler provides HTTP handlers for team operations.
type Handler struct {
	mu      sync.RWMutex
	teams   map[string]Team
	members map[string][]TeamMember // teamID -> members
	logger  *slog.Logger
}

// NewHandler creates a new team Handler with a pre-seeded default team.
func NewHandler(logger *slog.Logger) *Handler {
	h := &Handler{
		teams:   make(map[string]Team),
		members: make(map[string][]TeamMember),
		logger:  logger,
	}
	h.seed()
	return h
}

// seed pre-populates the in-memory store with the default team.
func (h *Handler) seed() {
	now := time.Now().UTC()

	defaultTeam := Team{
		ID:          defaultTeamID,
		Name:        "Default",
		Slug:        "default",
		Description: "Default platform team",
		Namespace:   defaultNamespace,
		MemberCount: 1,
		AgentCount:  0,
		CreatedAt:   now,
	}

	h.teams[defaultTeamID] = defaultTeam
	h.members[defaultTeamID] = []TeamMember{
		{
			UserID:   "us_DEV00000000000000000000",
			Email:    "adham@recif.dev",
			Role:     "platform_admin",
			JoinedAt: now,
		},
	}
}

// List handles GET /api/v1/teams.
// Platform admins see all teams; others see only their own team.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	teamID := middleware.TeamFromContext(r.Context())
	isPlatformAdmin := middleware.IsPlatformAdmin(r.Context())

	teams := make([]Team, 0, len(h.teams))
	for _, t := range h.teams {
		if isPlatformAdmin || t.ID == teamID {
			teams = append(teams, t)
		}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": teams})
}

// Create handles POST /api/v1/teams.
// Only platform_admin can create teams.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if !middleware.IsPlatformAdmin(r.Context()) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Only platform admins can create teams", r.URL.Path)
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

	slug := strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	now := time.Now().UTC()
	id := fmt.Sprintf("tk_%s", ulid.Make().String())

	team := Team{
		ID:          id,
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(req.Description),
		Namespace:   "team-" + slug,
		MemberCount: 0,
		AgentCount:  0,
		CreatedAt:   now,
	}

	h.mu.Lock()
	h.teams[id] = team
	h.members[id] = []TeamMember{}
	h.mu.Unlock()

	h.logger.Info("team created", "id", id, "name", name)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": team})
}

// Get handles GET /api/v1/teams/{teamId}.
// Returns team details + members.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	h.mu.RLock()
	team, ok := h.teams[teamID]
	if !ok {
		h.mu.RUnlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
		return
	}
	members := make([]TeamMember, len(h.members[teamID]))
	copy(members, h.members[teamID])
	h.mu.RUnlock()

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"team":    team,
		"members": members,
	})
}

// Delete handles DELETE /api/v1/teams/{teamId}.
// Only platform_admin can delete teams.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if !middleware.IsPlatformAdmin(r.Context()) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Only platform admins can delete teams", r.URL.Path)
		return
	}

	teamID := chi.URLParam(r, "teamId")

	h.mu.Lock()
	_, ok := h.teams[teamID]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
		return
	}
	delete(h.teams, teamID)
	delete(h.members, teamID)
	h.mu.Unlock()

	h.logger.Info("team deleted", "id", teamID)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Team deleted"})
}

// AddMember handles POST /api/v1/teams/{teamId}/members.
// Requires platform_admin or team admin.
func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	if !h.canManageTeam(r, teamID) {
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

	now := time.Now().UTC()
	member := TeamMember{
		UserID:   fmt.Sprintf("us_%s", ulid.Make().String()),
		Email:    email,
		Role:     role,
		JoinedAt: now,
	}

	h.mu.Lock()
	team, ok := h.teams[teamID]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
		return
	}

	// Check for duplicate email.
	for _, m := range h.members[teamID] {
		if m.Email == email {
			h.mu.Unlock()
			httputil.WriteError(w, http.StatusConflict, "Conflict", "User already a member of this team", r.URL.Path)
			return
		}
	}

	h.members[teamID] = append(h.members[teamID], member)
	team.MemberCount = len(h.members[teamID])
	h.teams[teamID] = team
	h.mu.Unlock()

	h.logger.Info("member added to team", "team_id", teamID, "email", email, "role", role)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": member})
}

// RemoveMember handles DELETE /api/v1/teams/{teamId}/members/{userId}.
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")
	userID := chi.URLParam(r, "userId")

	if !h.canManageTeam(r, teamID) {
		httputil.WriteError(w, http.StatusForbidden, "Forbidden", "Insufficient permissions to manage this team", r.URL.Path)
		return
	}

	h.mu.Lock()
	team, ok := h.teams[teamID]
	if !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
		return
	}

	members := h.members[teamID]
	found := false
	for i, m := range members {
		if m.UserID == userID {
			h.members[teamID] = append(members[:i], members[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Member not found", r.URL.Path)
		return
	}

	team.MemberCount = len(h.members[teamID])
	h.teams[teamID] = team
	h.mu.Unlock()

	h.logger.Info("member removed from team", "team_id", teamID, "user_id", userID)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Member removed"})
}

// UpdateMemberRole handles PATCH /api/v1/teams/{teamId}/members/{userId}.
func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")
	userID := chi.URLParam(r, "userId")

	if !h.canManageTeam(r, teamID) {
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

	h.mu.Lock()
	if _, ok := h.teams[teamID]; !ok {
		h.mu.Unlock()
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Team not found", r.URL.Path)
		return
	}

	members := h.members[teamID]
	found := false
	for i, m := range members {
		if m.UserID == userID {
			members[i].Role = role
			found = true
			break
		}
	}
	h.mu.Unlock()

	if !found {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Member not found", r.URL.Path)
		return
	}

	h.logger.Info("member role updated", "team_id", teamID, "user_id", userID, "role", role)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"message": "Role updated"})
}

// canManageTeam checks if the caller is a platform_admin or an admin of the given team.
func (h *Handler) canManageTeam(r *http.Request, teamID string) bool {
	if middleware.IsPlatformAdmin(r.Context()) {
		return true
	}

	claims := middleware.GetClaims(r.Context())
	if claims == nil || claims.TeamID != teamID {
		return false
	}

	// Check if user is an admin of this team.
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, m := range h.members[teamID] {
		if m.UserID == claims.UserID && m.Role == "admin" {
			return true
		}
	}

	return false
}

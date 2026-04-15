package auth

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"golang.org/x/crypto/bcrypt"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/user"
)

// UserReader is the subset of user.Repository needed by the auth handler.
type UserReader interface {
	GetByID(ctx context.Context, id string) (*user.User, error)
	GetHashByEmail(ctx context.Context, email string) (id, hash string, err error)
	UpdateProfile(ctx context.Context, id, name, email string) (*user.User, error)
	UpdatePassword(ctx context.Context, id, plainPassword string) error
}

// Handler provides HTTP handlers for auth flows.
type Handler struct {
	users  UserReader
	jwt    *LocalJWTProvider
	logger *slog.Logger
}

// NewHandler creates a new auth Handler.
func NewHandler(users UserReader, jwt *LocalJWTProvider, logger *slog.Logger) *Handler {
	return &Handler{users: users, jwt: jwt, logger: logger}
}

// LoginRequest is the payload for POST /auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse is returned on successful login.
type LoginResponse struct {
	Token string     `json:"token"`
	User  *user.User `json:"user"`
}

// Login handles POST /api/v1/auth/login — validates credentials and issues a JWT.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}
	if req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "email and password are required", r.URL.Path)
		return
	}

	id, hash, err := h.users.GetHashByEmail(r.Context(), req.Email)
	if err != nil {
		// Constant-time response to prevent user enumeration.
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Invalid email or password", r.URL.Path)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Invalid email or password", r.URL.Path)
		return
	}

	u, err := h.users.GetByID(r.Context(), id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to load user", r.URL.Path)
		return
	}

	token, err := h.jwt.IssueToken(&Claims{
		UserID: u.ID,
		TeamID: "tk_DEFAULT000000000000000000",
		Role:   u.Role,
		Email:  u.Email,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to issue token", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, LoginResponse{Token: token, User: u})
}

// Me handles GET /api/v1/auth/me — returns the current authenticated user.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Not authenticated", r.URL.Path)
		return
	}

	u, err := h.users.GetByID(r.Context(), claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "User not found", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, u)
}

// UpdateMe handles PATCH /api/v1/auth/me — updates the current user's display name.
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Not authenticated", r.URL.Path)
		return
	}

	var req user.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}
	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "name is required", r.URL.Path)
		return
	}

	u, err := h.users.UpdateProfile(r.Context(), claims.UserID, req.Name, claims.Email)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to update profile", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, u)
}

// ChangePassword handles POST /api/v1/auth/me/password — changes the current user's password.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Not authenticated", r.URL.Path)
		return
	}

	var req user.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON", r.URL.Path)
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "current_password and new_password are required", r.URL.Path)
		return
	}
	if len(req.NewPassword) < 8 {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request", "new_password must be at least 8 characters", r.URL.Path)
		return
	}

	_, hash, err := h.users.GetHashByEmail(r.Context(), claims.Email)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to verify current password", r.URL.Path)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.CurrentPassword)); err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Current password is incorrect", r.URL.Path)
		return
	}

	if err := h.users.UpdatePassword(r.Context(), claims.UserID, req.NewPassword); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to change password", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "Password changed successfully"})
}

package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/sciences44/recif/internal/auth"
	"github.com/sciences44/recif/internal/httputil"
)

const (
	defaultNamespace = "team-default"
	defaultUserID    = "us_DEV00000000000000000000"
	defaultRole      = "admin"
)

// Auth creates middleware that validates JWT tokens via the given AuthProvider.
// If authEnabled is false, requests without a token proceed with default dev claims.
// If a token IS provided, it is always validated regardless of authEnabled.
func Auth(provider auth.AuthProvider, authEnabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			hasToken := header != "" && strings.HasPrefix(header, "Bearer ")

			if hasToken {
				// Always validate a provided token.
				token := strings.TrimPrefix(header, "Bearer ")
				claims, err := provider.Validate(r.Context(), token)
				if err != nil {
					httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Invalid or expired token", r.URL.Path)
					return
				}
				ctx := auth.SetClaims(r.Context(), claims)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			if !authEnabled {
				// Dev mode, no token: inject default dev claims.
				ctx := auth.SetClaims(r.Context(), &auth.Claims{
					UserID: defaultUserID,
					TeamID: auth.DefaultTeamID,
					Role:   defaultRole,
				})
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Auth required, no token.
			httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Missing or invalid Authorization header", r.URL.Path)
		})
	}
}

// TeamFromContext extracts the team ID from context.
// Returns the default team ID if no claims are present.
func TeamFromContext(ctx context.Context) string {
	if claims := auth.GetClaims(ctx); claims != nil && claims.TeamID != "" {
		return claims.TeamID
	}
	return auth.DefaultTeamID
}

// NamespaceFromContext derives the K8s namespace from the team in context.
// Convention: team ID "tk_XXXX" maps to namespace "team-xxxx" (lowercase slug).
// Falls back to the default namespace.
func NamespaceFromContext(ctx context.Context) string {
	if claims := auth.GetClaims(ctx); claims != nil && claims.TeamID != "" {
		return teamIDToNamespace(claims.TeamID)
	}
	return defaultNamespace
}

// IsPlatformAdmin checks if the user has platform-wide admin role.
func IsPlatformAdmin(ctx context.Context) bool {
	if claims := auth.GetClaims(ctx); claims != nil {
		return claims.Role == "platform_admin"
	}
	return false
}

// teamIDToNamespace converts a team ID like "tk_DEFAULT000000000000000000"
// to a K8s namespace like "team-default".
func teamIDToNamespace(teamID string) string {
	name := strings.TrimPrefix(teamID, "tk_")
	name = strings.ToLower(name)
	if name == "" || strings.HasPrefix(name, "default") {
		return defaultNamespace
	}
	return "team-" + name
}

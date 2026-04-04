package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/sciences44/recif/internal/auth"
	"github.com/sciences44/recif/internal/httputil"
)

type claimsContextKey struct{}

const (
	defaultTeamID    = "tk_DEFAULT000000000000000000"
	defaultNamespace = "team-default"
	defaultUserID    = "us_DEV00000000000000000000"
	defaultRole      = "admin"
)

// Auth creates middleware that validates JWT tokens via the given AuthProvider.
// If authEnabled is false, all requests are allowed with default claims.
func Auth(provider auth.AuthProvider, authEnabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !authEnabled {
				// Dev mode: inject default claims
				ctx := context.WithValue(r.Context(), claimsContextKey{}, &auth.Claims{
					UserID: defaultUserID,
					TeamID: defaultTeamID,
					Role:   defaultRole,
				})
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			header := r.Header.Get("Authorization")
			if header == "" || !strings.HasPrefix(header, "Bearer ") {
				httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Missing or invalid Authorization header", r.URL.Path)
				return
			}

			token := strings.TrimPrefix(header, "Bearer ")
			claims, err := provider.Validate(r.Context(), token)
			if err != nil {
				httputil.WriteError(w, http.StatusUnauthorized, "Unauthorized", "Invalid or expired token", r.URL.Path)
				return
			}

			ctx := context.WithValue(r.Context(), claimsContextKey{}, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetClaims extracts auth claims from request context.
func GetClaims(ctx context.Context) *auth.Claims {
	if claims, ok := ctx.Value(claimsContextKey{}).(*auth.Claims); ok {
		return claims
	}
	return nil
}

// TeamFromContext extracts the team ID from context.
// Returns the default team ID if no claims are present.
func TeamFromContext(ctx context.Context) string {
	if claims := GetClaims(ctx); claims != nil && claims.TeamID != "" {
		return claims.TeamID
	}
	return defaultTeamID
}

// NamespaceFromContext derives the K8s namespace from the team in context.
// Convention: team ID "tk_XXXX" maps to namespace "team-xxxx" (lowercase slug).
// Falls back to the default namespace.
func NamespaceFromContext(ctx context.Context) string {
	if claims := GetClaims(ctx); claims != nil && claims.TeamID != "" {
		return teamIDToNamespace(claims.TeamID)
	}
	return defaultNamespace
}

// IsPlatformAdmin checks if the user has platform-wide admin role.
func IsPlatformAdmin(ctx context.Context) bool {
	if claims := GetClaims(ctx); claims != nil {
		return claims.Role == "platform_admin"
	}
	return false
}

// teamIDToNamespace converts a team ID like "tk_DEFAULT000000000000000000"
// to a K8s namespace like "team-default".
func teamIDToNamespace(teamID string) string {
	// Strip the "tk_" prefix and take the first meaningful segment.
	name := strings.TrimPrefix(teamID, "tk_")
	name = strings.ToLower(name)
	// Use a stable short prefix for the namespace.
	if name == "" || strings.HasPrefix(name, "default") {
		return defaultNamespace
	}
	return "team-" + name
}

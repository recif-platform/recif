package auth

import "context"

// Claims represents the authenticated user claims extracted from a token.
type Claims struct {
	UserID string `json:"user_id"`
	TeamID string `json:"team_id"`
	Role   string `json:"role"` // admin, developer, viewer
	Email  string `json:"email,omitempty"`
}

// AuthProvider defines the interface for authentication providers.
type AuthProvider interface {
	// Validate checks a token and returns the claims if valid.
	Validate(ctx context.Context, token string) (*Claims, error)

	// Name returns the provider name (e.g., "local-jwt", "oidc").
	Name() string
}

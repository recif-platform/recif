package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/oklog/ulid/v2"
)

// ErrInvalidToken is returned when a JWT token is invalid or expired.
var ErrInvalidToken = errors.New("invalid or expired token")

// LocalJWTProvider issues and validates JWT tokens locally.
type LocalJWTProvider struct {
	secret []byte
	ttl    time.Duration
}

// NewLocalJWTProvider creates a JWT provider with the given secret and TTL.
func NewLocalJWTProvider(secret string, ttl time.Duration) *LocalJWTProvider {
	return &LocalJWTProvider{
		secret: []byte(secret),
		ttl:    ttl,
	}
}

func (p *LocalJWTProvider) Name() string { return "local-jwt" }

// Validate parses and validates a JWT token.
func (p *LocalJWTProvider) Validate(_ context.Context, tokenString string) (*Claims, error) {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return p.secret, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}

	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return &Claims{
		UserID: getStringClaim(mapClaims, "sub"),
		TeamID: getStringClaim(mapClaims, "team_id"),
		Role:   getStringClaim(mapClaims, "role"),
		Email:  getStringClaim(mapClaims, "email"),
	}, nil
}

// IssueToken creates a new JWT token for the given claims.
func (p *LocalJWTProvider) IssueToken(claims *Claims) (string, error) {
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":     claims.UserID,
		"team_id": claims.TeamID,
		"role":    claims.Role,
		"email":   claims.Email,
		"iat":     now.Unix(),
		"exp":     now.Add(p.ttl).Unix(),
		"jti":     ulid.Make().String(),
	})

	return token.SignedString(p.secret)
}

func getStringClaim(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/sciences44/recif/internal/auth"
)

func TestLocalJWTProvider_IssueAndValidate(t *testing.T) {
	provider := auth.NewLocalJWTProvider("test-secret-key-32bytes!!", 1*time.Hour)

	claims := &auth.Claims{
		UserID: "us_TEST000000000000000000",
		TeamID: "tk_TEST000000000000000000",
		Role:   "developer",
		Email:  "test@example.com",
	}

	token, err := provider.IssueToken(claims)
	if err != nil {
		t.Fatalf("IssueToken failed: %v", err)
	}

	if token == "" {
		t.Fatal("token is empty")
	}

	validated, err := provider.Validate(context.Background(), token)
	if err != nil {
		t.Fatalf("Validate failed: %v", err)
	}

	if validated.UserID != claims.UserID {
		t.Errorf("UserID = %q, want %q", validated.UserID, claims.UserID)
	}
	if validated.Role != claims.Role {
		t.Errorf("Role = %q, want %q", validated.Role, claims.Role)
	}
}

func TestLocalJWTProvider_InvalidToken(t *testing.T) {
	provider := auth.NewLocalJWTProvider("test-secret", 1*time.Hour)

	_, err := provider.Validate(context.Background(), "invalid.token.here")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}

func TestLocalJWTProvider_ExpiredToken(t *testing.T) {
	provider := auth.NewLocalJWTProvider("test-secret", -1*time.Second) // Already expired

	claims := &auth.Claims{UserID: "us_TEST", TeamID: "tk_TEST", Role: "developer"}
	token, err := provider.IssueToken(claims)
	if err != nil {
		t.Fatalf("IssueToken failed: %v", err)
	}

	_, err = provider.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sciences44/recif/internal/auth"
)

func okHandler(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	json.NewEncoder(w).Encode(claims)
}

func newJWT() *auth.LocalJWTProvider {
	return auth.NewLocalJWTProvider("test-secret-middleware", 1*time.Hour)
}

func issueToken(jwt *auth.LocalJWTProvider, userID, teamID, role string) string {
	t, _ := jwt.IssueToken(&auth.Claims{UserID: userID, TeamID: teamID, Role: role})
	return t
}

// --- Auth Middleware Tests ---

func TestAuth_DevMode_NoToken(t *testing.T) {
	jwt := newJWT()
	mw := Auth(jwt, false)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var claims auth.Claims
	json.NewDecoder(rec.Body).Decode(&claims)
	if claims.UserID != defaultUserID {
		t.Errorf("expected default user %s, got %s", defaultUserID, claims.UserID)
	}
	if claims.Role != auth.RoleAdmin {
		t.Errorf("expected default role admin, got %s", claims.Role)
	}
}

func TestAuth_DevMode_WithValidToken(t *testing.T) {
	jwt := newJWT()
	token := issueToken(jwt, "us_REAL", "tk_TEAM1", "developer")
	mw := Auth(jwt, false)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var claims auth.Claims
	json.NewDecoder(rec.Body).Decode(&claims)
	if claims.UserID != "us_REAL" {
		t.Errorf("expected us_REAL, got %s — token should override dev defaults", claims.UserID)
	}
}

func TestAuth_DevMode_WithInvalidToken(t *testing.T) {
	jwt := newJWT()
	mw := Auth(jwt, false)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-garbage-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid token even in dev mode, got %d", rec.Code)
	}
}

func TestAuth_Enabled_NoToken(t *testing.T) {
	jwt := newJWT()
	mw := Auth(jwt, true)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when auth enabled and no token, got %d", rec.Code)
	}
}

func TestAuth_Enabled_ValidToken(t *testing.T) {
	jwt := newJWT()
	token := issueToken(jwt, "us_ADMIN", "tk_DEFAULT", "admin")
	mw := Auth(jwt, true)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var claims auth.Claims
	json.NewDecoder(rec.Body).Decode(&claims)
	if claims.UserID != "us_ADMIN" {
		t.Errorf("expected us_ADMIN, got %s", claims.UserID)
	}
}

func TestAuth_Enabled_ExpiredToken(t *testing.T) {
	jwt := auth.NewLocalJWTProvider("test-secret-middleware", -1*time.Hour) // already expired
	token := issueToken(jwt, "us_X", "tk_X", "admin")

	validJWT := newJWT() // validator with normal TTL
	mw := Auth(validJWT, true)
	handler := mw(http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d", rec.Code)
	}
}

func TestAuth_MalformedHeader(t *testing.T) {
	jwt := newJWT()
	mw := Auth(jwt, true)
	handler := mw(http.HandlerFunc(okHandler))

	// "Basic" instead of "Bearer"
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic abc123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for non-Bearer auth, got %d", rec.Code)
	}
}

// --- Context Helper Tests ---

func TestTeamFromContext(t *testing.T) {
	// With claims
	ctx := auth.SetClaims(context.Background(), &auth.Claims{TeamID: "tk_MYTEAM"})
	if got := TeamFromContext(ctx); got != "tk_MYTEAM" {
		t.Errorf("expected tk_MYTEAM, got %s", got)
	}
	// Without claims — returns default
	if got := TeamFromContext(context.Background()); got != auth.DefaultTeamID {
		t.Errorf("expected default team, got %s", got)
	}
}

func TestNamespaceFromContext(t *testing.T) {
	ctx := auth.SetClaims(context.Background(), &auth.Claims{TeamID: "tk_ENGINEERING"})
	if got := NamespaceFromContext(ctx); got != "team-engineering" {
		t.Errorf("expected team-engineering, got %s", got)
	}
	// Default team → default namespace
	ctx2 := auth.SetClaims(context.Background(), &auth.Claims{TeamID: auth.DefaultTeamID})
	if got := NamespaceFromContext(ctx2); got != "team-default" {
		t.Errorf("expected team-default, got %s", got)
	}
}

func TestIsPlatformAdmin(t *testing.T) {
	ctx := auth.SetClaims(context.Background(), &auth.Claims{Role: auth.RolePlatformAdmin})
	if !IsPlatformAdmin(ctx) {
		t.Error("expected true for platform_admin")
	}
	ctx2 := auth.SetClaims(context.Background(), &auth.Claims{Role: auth.RoleAdmin})
	if IsPlatformAdmin(ctx2) {
		t.Error("expected false for admin (not platform_admin)")
	}
	if IsPlatformAdmin(context.Background()) {
		t.Error("expected false for empty context")
	}
}

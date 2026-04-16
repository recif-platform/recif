package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/sciences44/recif/internal/user"
)

// --- Fake UserManager ---

var errFakeNotFound = errors.New("not found")

type fakeUserManager struct {
	users map[string]*fakeUserEntry
}

type fakeUserEntry struct {
	id   string
	name string
	role string
	hash string
}

func newFakeUsers() *fakeUserManager {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	return &fakeUserManager{
		users: map[string]*fakeUserEntry{
			"admin@test.com": {id: "us_TEST01", name: "Admin", role: "admin", hash: string(hash)},
		},
	}
}

func (f *fakeUserManager) GetByID(_ context.Context, id string) (*user.User, error) {
	for email, u := range f.users {
		if u.id == id {
			return &user.User{ID: u.id, Email: email, Name: u.name, Role: u.role}, nil
		}
	}
	return nil, errFakeNotFound
}

func (f *fakeUserManager) GetByEmailForLogin(_ context.Context, email string) (*user.User, string, error) {
	u, ok := f.users[email]
	if !ok {
		return nil, "", errFakeNotFound
	}
	return &user.User{ID: u.id, Email: email, Name: u.name, Role: u.role}, u.hash, nil
}

func (f *fakeUserManager) GetHashByEmail(_ context.Context, email string) (string, string, error) {
	u, ok := f.users[email]
	if !ok {
		return "", "", errFakeNotFound
	}
	return u.id, u.hash, nil
}

func (f *fakeUserManager) UpdateProfile(_ context.Context, id, name, email string) (*user.User, error) {
	for _, u := range f.users {
		if u.id == id {
			u.name = name
			return &user.User{ID: u.id, Email: email, Name: name, Role: u.role}, nil
		}
	}
	return nil, errFakeNotFound
}

func (f *fakeUserManager) Create(_ context.Context, id, email, name, role, plain string) (*user.User, error) {
	hash, _ := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.MinCost)
	f.users[email] = &fakeUserEntry{id: id, name: name, role: role, hash: string(hash)}
	return &user.User{ID: id, Email: email, Name: name, Role: role}, nil
}

func (f *fakeUserManager) UpdatePassword(_ context.Context, id, plain string) error {
	for _, u := range f.users {
		if u.id == id {
			h, _ := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.MinCost)
			u.hash = string(h)
			return nil
		}
	}
	return errFakeNotFound
}

// --- Helpers ---

func testHandler() *Handler {
	jwt := NewLocalJWTProvider("test-secret", 24*time.Hour)
	return NewHandler(newFakeUsers(), jwt, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func postJSON(path string, body any) *http.Request {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return req
}

// --- Login Tests ---

func TestLogin_Success(t *testing.T) {
	h := testHandler()
	rec := httptest.NewRecorder()
	h.Login(rec, postJSON("/login", LoginRequest{Email: "admin@test.com", Password: "correct-password"}))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp LoginResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Token == "" {
		t.Fatal("expected non-empty token")
	}
	if resp.User.Name != "Admin" {
		t.Fatalf("expected Admin, got %s", resp.User.Name)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	h := testHandler()
	rec := httptest.NewRecorder()
	h.Login(rec, postJSON("/login", LoginRequest{Email: "admin@test.com", Password: "wrong"}))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	h := testHandler()
	rec := httptest.NewRecorder()
	h.Login(rec, postJSON("/login", LoginRequest{Email: "nobody@test.com", Password: "x"}))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestLogin_MissingFields(t *testing.T) {
	h := testHandler()
	rec := httptest.NewRecorder()
	h.Login(rec, postJSON("/login", LoginRequest{}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// --- Me Tests ---

func TestMe_WithClaims(t *testing.T) {
	h := testHandler()
	ctx := SetClaims(context.Background(), &Claims{UserID: "us_TEST01", Role: "admin", Email: "admin@test.com"})
	req := httptest.NewRequest(http.MethodGet, "/me", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	h.Me(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMe_NoClaims(t *testing.T) {
	h := testHandler()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()
	h.Me(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

// --- ChangePassword Tests ---

func TestChangePassword_WrongCurrent(t *testing.T) {
	h := testHandler()
	ctx := SetClaims(context.Background(), &Claims{UserID: "us_TEST01", Role: "admin", Email: "admin@test.com"})
	req := postJSON("/password", map[string]string{"current_password": "wrong", "new_password": "newpass123"}).WithContext(ctx)
	rec := httptest.NewRecorder()
	h.ChangePassword(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestChangePassword_TooShort(t *testing.T) {
	h := testHandler()
	ctx := SetClaims(context.Background(), &Claims{UserID: "us_TEST01", Role: "admin", Email: "admin@test.com"})
	req := postJSON("/password", map[string]string{"current_password": "correct-password", "new_password": "short"}).WithContext(ctx)
	rec := httptest.NewRecorder()
	h.ChangePassword(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// --- RBAC Tests ---

func TestIsAdmin(t *testing.T) {
	cases := []struct {
		role string
		want bool
	}{
		{RoleAdmin, true},
		{RolePlatformAdmin, true},
		{RoleDeveloper, false},
		{RoleViewer, false},
		{"", false},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			if got := IsAdmin(&Claims{Role: tc.role}); got != tc.want {
				t.Errorf("IsAdmin(%q) = %v, want %v", tc.role, got, tc.want)
			}
		})
	}
	if IsAdmin(nil) {
		t.Error("IsAdmin(nil) should be false")
	}
}

func TestSetGetClaims(t *testing.T) {
	claims := &Claims{UserID: "u1", TeamID: "t1", Role: "admin"}
	ctx := SetClaims(context.Background(), claims)
	got := GetClaims(ctx)
	if got == nil || got.UserID != "u1" {
		t.Fatalf("expected claims with UserID u1, got %+v", got)
	}
	if GetClaims(context.Background()) != nil {
		t.Error("expected nil claims from empty context")
	}
}

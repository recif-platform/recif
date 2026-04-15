package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/sciences44/recif/internal/httputil"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// ---------- buildTargetURL ----------

func TestBuildTargetURL_WithTemplate(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://%s.ns.svc.cluster.local:8000")
	got := h.buildTargetURL("weather-bot", "/chat")
	want := "http://weather-bot.ns.svc.cluster.local:8000/chat"
	if got != want {
		t.Errorf("buildTargetURL = %q, want %q", got, want)
	}
}

func TestBuildTargetURL_WithoutTemplate(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://localhost:9000")
	got := h.buildTargetURL("weather-bot", "/chat")
	want := "http://localhost:9000/chat"
	if got != want {
		t.Errorf("buildTargetURL = %q, want %q", got, want)
	}
}

func TestBuildTargetURL_DefaultBase(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "")
	got := h.buildTargetURL("my-agent", "/chat/stream")
	want := "http://my-agent.team-default.svc.cluster.local:8000/chat/stream"
	if got != want {
		t.Errorf("buildTargetURL = %q, want %q", got, want)
	}
}

// ---------- helpers ----------

// routedRecorder dispatches a request through a minimal chi router
// so that URL params like {id} and {cid} are populated.
func routedRecorder(t *testing.T, method, pattern, target string, handler http.HandlerFunc, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	switch method {
	case http.MethodPost:
		r.Post(pattern, handler)
	case http.MethodGet:
		r.Get(pattern, handler)
	default:
		t.Fatalf("unsupported method %s", method)
	}

	req := httptest.NewRequest(method, target, body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// ---------- ag_ prefix rejection ----------

func TestChat_RejectsAgPrefix(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://localhost:9999")
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat", "/agents/ag_123/chat", h.Chat, strings.NewReader(`{}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var problem httputil.ProblemDetail
	if err := json.NewDecoder(rec.Body).Decode(&problem); err != nil {
		t.Fatalf("decode problem: %v", err)
	}
	if problem.Status != http.StatusBadRequest {
		t.Errorf("problem.Status = %d, want 400", problem.Status)
	}
	if !strings.Contains(problem.Detail, "slug") {
		t.Errorf("expected detail to mention 'slug', got %q", problem.Detail)
	}
}

func TestChatStream_RejectsAgPrefix(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://localhost:9999")
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat/stream", "/agents/ag_xyz/chat/stream", h.ChatStream, strings.NewReader(`{}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestConversations_RejectsAgPrefix(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://localhost:9999")
	rec := routedRecorder(t, http.MethodGet, "/agents/{id}/conversations", "/agents/ag_abc/conversations", h.Conversations, nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestConversationDetail_RejectsAgPrefix(t *testing.T) {
	h := NewProxyHandler(newTestLogger(), "http://localhost:9999")
	rec := routedRecorder(t, http.MethodGet, "/agents/{id}/conversations/{cid}", "/agents/ag_abc/conversations/conv_1", h.ConversationDetail, nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// ---------- successful proxy forwarding ----------

func TestChat_ProxiesSuccessfully(t *testing.T) {
	// Fake agent backend -- proxy adds /control/ prefix
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/control/chat" {
			t.Errorf("backend got path %q, want /control/chat", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("backend got method %q, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"reply":"hello"}`)
	}))
	defer backend.Close()

	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat", "/agents/weather-bot/chat", h.Chat,
		strings.NewReader(`{"message":"hi"}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["reply"] != "hello" {
		t.Errorf("reply = %q, want %q", body["reply"], "hello")
	}
}

func TestChatStream_ForwardsSSEHeaders(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/control/chat/stream" {
			t.Errorf("backend got path %q, want /control/chat/stream", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "data: {\"token\":\"hi\"}\n\n")
	}))
	defer backend.Close()

	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat/stream", "/agents/weather-bot/chat/stream", h.ChatStream,
		strings.NewReader(`{"message":"hi"}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}

	cc := rec.Header().Get("Cache-Control")
	if cc != "no-cache" {
		t.Errorf("Cache-Control = %q, want no-cache", cc)
	}

	if !strings.Contains(rec.Body.String(), "data:") {
		t.Error("expected SSE data in body")
	}
}

func TestConversations_ProxiesSuccessfully(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/control/conversations" {
			t.Errorf("backend got path %q, want /control/conversations", r.URL.Path)
		}
		if r.Method != http.MethodGet {
			t.Errorf("backend got method %q, want GET", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `[{"id":"conv_1"}]`)
	}))
	defer backend.Close()

	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodGet, "/agents/{id}/conversations", "/agents/my-agent/conversations", h.Conversations, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestConversationDetail_ProxiesWithCID(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/control/conversations/conv_42" {
			t.Errorf("backend got path %q, want /control/conversations/conv_42", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"id":"conv_42","messages":[]}`)
	}))
	defer backend.Close()

	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodGet, "/agents/{id}/conversations/{cid}",
		"/agents/my-agent/conversations/conv_42", h.ConversationDetail, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
	}
}

func TestChat_ProxiesWithTemplateURL(t *testing.T) {
	// Ensure the template URL correctly substitutes the slug.
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer backend.Close()

	// The template contains %s but our backend is a fixed URL,
	// so use a non-template URL here; the buildTargetURL tests above cover the template logic.
	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat", "/agents/dashboard-test/chat", h.Chat,
		strings.NewReader(`{"message":"test"}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

// ---------- backend unreachable ----------

func TestChat_BackendUnreachable(t *testing.T) {
	// Point to a port that is guaranteed to be closed.
	h := NewProxyHandler(newTestLogger(), "http://127.0.0.1:1")
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat", "/agents/dead-agent/chat", h.Chat,
		strings.NewReader(`{}`))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rec.Code)
	}

	var problem httputil.ProblemDetail
	if err := json.NewDecoder(rec.Body).Decode(&problem); err != nil {
		t.Fatalf("decode problem: %v", err)
	}
	if problem.Status != http.StatusBadGateway {
		t.Errorf("problem.Status = %d, want 502", problem.Status)
	}
	if !strings.Contains(problem.Detail, "dead-agent") {
		t.Errorf("expected detail to contain agent slug, got %q", problem.Detail)
	}
}

// ---------- backend returns non-200 ----------

func TestChat_BackendReturnsError(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"error":"boom"}`)
	}))
	defer backend.Close()

	h := NewProxyHandler(newTestLogger(), backend.URL)
	rec := routedRecorder(t, http.MethodPost, "/agents/{id}/chat", "/agents/buggy/chat", h.Chat,
		strings.NewReader(`{}`))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 (forwarded from backend), got %d", rec.Code)
	}
}

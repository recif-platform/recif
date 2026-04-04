package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sciences44/recif/internal/config"
	"github.com/sciences44/recif/internal/observability"
	"github.com/sciences44/recif/internal/server"
)

func newTestServer() *server.Server {
	cfg := config.Config{
		Port:      "0",
		LogLevel:  "error",
		LogFormat: "text",
	}
	logger := observability.SetupLogger(cfg.LogLevel, cfg.LogFormat)
	return server.New(cfg, logger, nil, nil)
}

func TestHealthz(t *testing.T) {
	srv := newTestServer()
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIHealth(t *testing.T) {
	srv := newTestServer()
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/v1/health")
	if err != nil {
		t.Fatalf("GET /api/v1/health: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestRequestIDHeader(t *testing.T) {
	srv := newTestServer()
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	rid := resp.Header.Get("X-Request-ID")
	if rid == "" {
		t.Error("expected X-Request-ID header")
	}
	if len(rid) < 4 || rid[:4] != "req_" {
		t.Errorf("expected req_ prefix, got %q", rid)
	}
}

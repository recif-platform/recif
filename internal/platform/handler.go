package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sciences44/recif/internal/config"
	"github.com/sciences44/recif/internal/httputil"
)

// PlatformConfig holds the editable platform-level settings.
type PlatformConfig struct {
	StateRepo   string `json:"state_repo"`
	StateBranch string `json:"state_branch"`
	StateToken  string `json:"state_token"`
	MLflowURI   string `json:"mlflow_uri"`
}

// OnUpdateFunc is called after config is saved, allowing live propagation.
type OnUpdateFunc func(cfg PlatformConfig)

// Handler serves GET/PUT /api/v1/platform/config.
type Handler struct {
	mu       sync.RWMutex
	pool     *pgxpool.Pool
	logger   *slog.Logger
	cfg      PlatformConfig
	onUpdate OnUpdateFunc
}

// NewHandler creates a platform config handler seeded from the app config,
// then loads any overrides persisted in the database.
func NewHandler(pool *pgxpool.Pool, appCfg config.Config, logger *slog.Logger) *Handler {
	h := &Handler{
		pool:   pool,
		logger: logger,
		cfg: PlatformConfig{
			StateRepo:   appCfg.StateRepo,
			StateBranch: appCfg.StateBranch,
			StateToken:  appCfg.StateToken,
			MLflowURI:   appCfg.MLflowURI,
		},
	}
	h.loadFromDB()
	return h
}

// SetOnUpdate registers a callback invoked after each config save.
func (h *Handler) SetOnUpdate(fn OnUpdateFunc) {
	h.mu.Lock()
	h.onUpdate = fn
	h.mu.Unlock()
}

func (h *Handler) loadFromDB() {
	if h.pool == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.pool.Query(ctx, `SELECT key, value FROM platform_config`)
	if err != nil {
		h.logger.Warn("failed to load platform config from DB", "error", err)
		return
	}
	defer rows.Close()

	h.mu.Lock()
	defer h.mu.Unlock()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		switch k {
		case "state_repo":
			h.cfg.StateRepo = v
		case "state_branch":
			h.cfg.StateBranch = v
		case "state_token":
			h.cfg.StateToken = v
		case "mlflow_uri":
			h.cfg.MLflowURI = v
		}
	}
}

// Get returns the current platform configuration.
func (h *Handler) Get(w http.ResponseWriter, _ *http.Request) {
	h.mu.RLock()
	out := h.cfg
	h.mu.RUnlock()

	out.StateToken = maskToken(out.StateToken)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// Update persists platform configuration changes.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	var body PlatformConfig
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	h.mu.Lock()
	if body.StateRepo != "" {
		h.cfg.StateRepo = body.StateRepo
	}
	if body.StateBranch != "" {
		h.cfg.StateBranch = body.StateBranch
	}
	// Only update token if not the masked placeholder
	if body.StateToken != "" && !strings.HasPrefix(body.StateToken, "***") {
		h.cfg.StateToken = body.StateToken
	}
	if body.MLflowURI != "" {
		h.cfg.MLflowURI = body.MLflowURI
	}
	snapshot := h.cfg
	h.mu.Unlock()

	if h.pool != nil {
		h.persistToDB(snapshot)
	}

	// Propagate to live services (git client, etc.)
	if h.onUpdate != nil {
		h.onUpdate(snapshot)
	}

	snapshot.StateToken = maskToken(snapshot.StateToken)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": snapshot})
}

func (h *Handler) persistToDB(cfg PlatformConfig) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fields := map[string]string{
		"state_repo":   cfg.StateRepo,
		"state_branch": cfg.StateBranch,
		"state_token":  cfg.StateToken,
		"mlflow_uri":   cfg.MLflowURI,
	}
	for k, v := range fields {
		_, err := h.pool.Exec(ctx,
			`INSERT INTO platform_config (key, value, updated_at) VALUES ($1, $2, NOW())
			 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
			k, v)
		if err != nil {
			h.logger.Warn("failed to persist platform config", "key", k, "error", err)
		}
	}
}

// TestConnection verifies connectivity to GitHub repo and MLflow.
func (h *Handler) TestConnection(w http.ResponseWriter, _ *http.Request) {
	h.mu.RLock()
	cfg := h.cfg
	h.mu.RUnlock()

	result := map[string]any{}

	// Test GitHub state repo
	ghStatus := testGitHub(cfg.StateRepo, cfg.StateBranch, cfg.StateToken)
	result["github"] = ghStatus

	// Test MLflow
	mlStatus := testMLflow(cfg.MLflowURI)
	result["mlflow"] = mlStatus

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": result})
}

func testGitHub(repo, branch, token string) map[string]any {
	if repo == "" {
		return map[string]any{"status": "unconfigured", "message": "No repository configured"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://api.github.com/repos/%s?ref=%s", repo, branch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return map[string]any{"status": "error", "message": err.Error()}
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]any{"status": "error", "message": "Connection failed: " + err.Error()}
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == 200 {
		return map[string]any{"status": "connected", "message": fmt.Sprintf("Repository %s accessible", repo)}
	}
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return map[string]any{"status": "error", "message": "Authentication failed — check your GitHub token"}
	}
	if resp.StatusCode == 404 {
		return map[string]any{"status": "error", "message": fmt.Sprintf("Repository %s not found — check the name or token permissions", repo)}
	}
	return map[string]any{"status": "error", "message": fmt.Sprintf("GitHub API returned %d", resp.StatusCode)}
}

func testMLflow(uri string) map[string]any {
	if uri == "" {
		return map[string]any{"status": "unconfigured", "message": "No MLflow URI configured"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := strings.TrimRight(uri, "/") + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return map[string]any{"status": "error", "message": err.Error()}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]any{"status": "error", "message": "Connection failed: " + err.Error()}
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == 200 {
		return map[string]any{"status": "connected", "message": "MLflow is reachable"}
	}
	return map[string]any{"status": "error", "message": fmt.Sprintf("MLflow returned %d", resp.StatusCode)}
}

// Config returns the current live config values.
func (h *Handler) Config() PlatformConfig {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.cfg
}

func maskToken(token string) string {
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return "***"
	}
	return token[:4] + "***" + token[len(token)-4:]
}

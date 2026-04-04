package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// ControlClient communicates with Corail's control plane endpoints.
//
// Endpoints on the Corail side:
//
//	GET  /control/status  — agent status
//	GET  /control/events  — SSE event stream
//	POST /control/config  — update config
//	POST /control/reload  — reload tools or KBs
//	POST /control/pause   — pause agent
//	POST /control/resume  — resume agent
type ControlClient struct {
	baseURL string
	http    *http.Client
	logger  *slog.Logger
}

// NewControlClient creates a client that talks to one Corail agent pod.
// baseURL is e.g. "http://my-agent.team-default.svc.cluster.local:8000".
func NewControlClient(baseURL string, logger *slog.Logger) *ControlClient {
	return &ControlClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http: &http.Client{
			Timeout: 10 * time.Second,
		},
		logger: logger,
	}
}

// AgentStatusResponse mirrors the JSON returned by GET /control/status.
type AgentStatusResponse struct {
	AgentID          string   `json:"agent_id"`
	Phase            string   `json:"phase"`
	ActiveSessions   int      `json:"active_sessions"`
	ToolsCount       int      `json:"tools_count"`
	KBsCount         int      `json:"kbs_count"`
	LoadedTools      []string `json:"loaded_tools"`
	LoadedKBs        []string `json:"loaded_kbs"`
	EventSubscribers int      `json:"event_subscribers"`
	EventHistorySize int      `json:"event_history_size"`
}

// AckResponse mirrors the JSON returned by command endpoints.
type AckResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// AgentEventData is a single event received from the SSE stream.
type AgentEventData struct {
	Type      string                 `json:"type"`
	Timestamp string                 `json:"timestamp"`
	AgentID   string                 `json:"agent_id"`
	UserID    string                 `json:"user_id"`
	SessionID string                 `json:"session_id"`
	Data      map[string]interface{} `json:"data"`
}

// GetStatus calls GET /control/status on the Corail agent.
func (c *ControlClient) GetStatus(ctx context.Context) (*AgentStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/control/status", nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("status request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status: unexpected status %d", resp.StatusCode)
	}

	var status AgentStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("decode status: %w", err)
	}
	return &status, nil
}

// UpdateConfig calls POST /control/config with the given key-value pairs.
func (c *ControlClient) UpdateConfig(ctx context.Context, config map[string]string) (*AckResponse, error) {
	body := map[string]interface{}{"config": config}
	return c.postCommand(ctx, "/control/config", body)
}

// ReloadTools calls POST /control/reload with target=tools.
func (c *ControlClient) ReloadTools(ctx context.Context, reason string) (*AckResponse, error) {
	return c.postCommand(ctx, "/control/reload", map[string]interface{}{
		"target": "tools",
		"reason": reason,
	})
}

// ReloadKnowledgeBases calls POST /control/reload with target=knowledge_bases.
func (c *ControlClient) ReloadKnowledgeBases(ctx context.Context, reason string) (*AckResponse, error) {
	return c.postCommand(ctx, "/control/reload", map[string]interface{}{
		"target": "knowledge_bases",
		"reason": reason,
	})
}

// Pause calls POST /control/pause.
func (c *ControlClient) Pause(ctx context.Context) (*AckResponse, error) {
	return c.postCommand(ctx, "/control/pause", nil)
}

// Resume calls POST /control/resume.
func (c *ControlClient) Resume(ctx context.Context) (*AckResponse, error) {
	return c.postCommand(ctx, "/control/resume", nil)
}

// SubscribeEvents connects to GET /control/events (SSE) and delivers events
// to the provided channel. Blocks until the context is canceled or the
// connection drops. The caller owns the channel and should close it after
// this function returns.
func (c *ControlClient) SubscribeEvents(ctx context.Context, out chan<- AgentEventData) error {
	// SSE connections are long-lived — use a client without timeout.
	sseClient := &http.Client{}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/control/events", nil)
	if err != nil {
		return fmt.Errorf("build SSE request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("SSE connect: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("SSE: unexpected status %d", resp.StatusCode)
	}

	c.logger.Info("SSE connected", "url", c.baseURL+"/control/events")

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")

		var event AgentEventData
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			c.logger.Warn("SSE: bad JSON", "payload", payload, "error", err)
			continue
		}

		select {
		case out <- event:
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("SSE read: %w", err)
	}
	return nil
}

// postCommand is a helper that POSTs JSON to a control endpoint.
func (c *ControlClient) postCommand(ctx context.Context, path string, payload interface{}) (*AckResponse, error) {
	var bodyBytes []byte
	var err error
	if payload != nil {
		bodyBytes, err = json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("marshal payload: %w", err)
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("post %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	var ack AckResponse
	if err := json.NewDecoder(resp.Body).Decode(&ack); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return &ack, fmt.Errorf("command failed (HTTP %d): %s", resp.StatusCode, ack.Message)
	}

	return &ack, nil
}

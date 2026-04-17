package prompt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// MLflowClient is a thin HTTP client for the MLflow Prompt Registry REST API.
type MLflowClient struct {
	baseURL string
	http    *http.Client
}

// NewMLflowClient creates a new MLflow REST client.
func NewMLflowClient(mlflowURI string) *MLflowClient {
	return &MLflowClient{
		baseURL: mlflowURI,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// RegisterPrompt creates or versions a prompt.
func (c *MLflowClient) RegisterPrompt(ctx context.Context, name, template, commitMessage string, tags map[string]string) (map[string]any, error) {
	body := map[string]any{
		"name":           name,
		"template":       template,
		"commit_message": commitMessage,
	}
	if len(tags) > 0 {
		body["tags"] = tags
	}
	return c.post(ctx, "/api/2.0/mlflow/prompts/create", body)
}

// GetPrompt returns a prompt by name.
func (c *MLflowClient) GetPrompt(ctx context.Context, name string) (map[string]any, error) {
	return c.get(ctx, "/api/2.0/mlflow/prompts/get?name="+url.QueryEscape(name))
}

// SearchPrompts lists all prompts.
func (c *MLflowClient) SearchPrompts(ctx context.Context, filter string, maxResults int) (map[string]any, error) {
	body := map[string]any{"max_results": maxResults}
	if filter != "" {
		body["filter"] = filter
	}
	return c.post(ctx, "/api/2.0/mlflow/prompts/search", body)
}

// GetPromptVersion returns a specific version of a prompt.
func (c *MLflowClient) GetPromptVersion(ctx context.Context, name string, version int) (map[string]any, error) {
	return c.get(ctx, fmt.Sprintf("/api/2.0/mlflow/prompts/get-version?name=%s&version=%d", url.QueryEscape(name), version))
}

// SetAlias assigns an alias to a specific prompt version.
func (c *MLflowClient) SetAlias(ctx context.Context, name, alias string, version int) (map[string]any, error) {
	return c.post(ctx, "/api/2.0/mlflow/prompts/set-alias", map[string]any{
		"name":    name,
		"alias":   alias,
		"version": version,
	})
}

// DeleteAlias removes an alias from a prompt.
func (c *MLflowClient) DeleteAlias(ctx context.Context, name, alias string) error {
	_, err := c.doRequest(ctx, http.MethodDelete,
		fmt.Sprintf("/api/2.0/mlflow/prompts/delete-alias?name=%s&alias=%s", url.QueryEscape(name), url.QueryEscape(alias)),
		nil)
	return err
}

// ResolvePromptText loads a prompt by ref and returns the template text.
func (c *MLflowClient) ResolvePromptText(ctx context.Context, promptRef string) (string, error) {
	// This is a convenience method — parses the ref and fetches from MLflow.
	// For now, get the prompt and return the latest version template.
	data, err := c.GetPrompt(ctx, promptRef)
	if err != nil {
		return "", err
	}
	if p, ok := data["prompt"].(map[string]any); ok {
		if latest, ok := p["latest_version"].(map[string]any); ok {
			if tmpl, ok := latest["template"].(string); ok {
				return tmpl, nil
			}
		}
	}
	return "", fmt.Errorf("could not resolve prompt text for %q", promptRef)
}

func (c *MLflowClient) get(ctx context.Context, path string) (map[string]any, error) {
	return c.doRequest(ctx, http.MethodGet, path, nil)
}

func (c *MLflowClient) post(ctx context.Context, path string, body any) (map[string]any, error) {
	return c.doRequest(ctx, http.MethodPost, path, body)
}

func (c *MLflowClient) doRequest(ctx context.Context, method, path string, body any) (map[string]any, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mlflow request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mlflow error %d: %s", resp.StatusCode, string(respBody))
	}

	var result map[string]any
	if len(respBody) > 0 {
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
	}
	return result, nil
}

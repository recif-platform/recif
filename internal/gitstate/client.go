package gitstate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

// Client reads and writes files in a GitHub repository via the Contents API.
type Client struct {
	mu      sync.RWMutex
	repo    string // e.g. "sciences44/recif-state"
	branch  string // e.g. "main"
	token   string // GitHub personal access token
	baseURL string // "https://api.github.com"
}

// NewClient creates a new GitHub state client.
func NewClient(repo, branch, token string) *Client {
	return &Client{
		repo:    repo,
		branch:  branch,
		token:   token,
		baseURL: "https://api.github.com",
	}
}

// UpdateConfig replaces the repo, branch, and token on a live client.
func (c *Client) UpdateConfig(repo, branch, token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.repo = repo
	c.branch = branch
	c.token = token
}

// snapshot returns a copy of the current config under read lock.
func (c *Client) snapshot() (repo, branch, token, baseURL string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.repo, c.branch, c.token, c.baseURL
}

// contentsURL returns the GitHub Contents API URL for the given path.
func (c *Client) contentsURL(path string) string {
	repo, _, _, baseURL := c.snapshot()
	return fmt.Sprintf("%s/repos/%s/contents/%s", baseURL, repo, path)
}

// doRequest executes an HTTP request with auth and returns the body bytes.
func (c *Client) doRequest(ctx context.Context, method, url string, body io.Reader) ([]byte, int, error) {
	_, _, token, _ := c.snapshot()

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read body: %w", err)
	}
	return data, resp.StatusCode, nil
}

// ghFileResponse represents the GitHub Contents API response for a single file.
type ghFileResponse struct {
	Content  string `json:"content"`
	SHA      string `json:"sha"`
	Encoding string `json:"encoding"`
}

// ghDirEntry represents a single item when listing a directory.
type ghDirEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Path string `json:"path"`
}

// ReadFile reads a file from the repo and returns its decoded content.
func (c *Client) ReadFile(ctx context.Context, path string) (string, error) {
	_, branch, _, _ := c.snapshot()
	url := c.contentsURL(path) + "?ref=" + branch
	data, status, err := c.doRequest(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	if status == http.StatusNotFound {
		return "", fmt.Errorf("file not found: %s", path)
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("github API error (status %d): %s", status, string(data))
	}

	var file ghFileResponse
	if err := json.Unmarshal(data, &file); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(file.Content)
	if err != nil {
		// GitHub sometimes uses newline-separated base64
		cleaned := ""
		for _, c := range file.Content {
			if c != '\n' && c != '\r' {
				cleaned += string(c)
			}
		}
		decoded, err = base64.StdEncoding.DecodeString(cleaned)
		if err != nil {
			return "", fmt.Errorf("decode base64: %w", err)
		}
	}

	return string(decoded), nil
}

// getFileSHA returns the SHA of a file, or empty string if it does not exist.
func (c *Client) getFileSHA(ctx context.Context, path string) (string, error) {
	_, branch, _, _ := c.snapshot()
	url := c.contentsURL(path) + "?ref=" + branch
	data, status, err := c.doRequest(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	if status == http.StatusNotFound {
		return "", nil // file does not exist
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("github API error (status %d): %s", status, string(data))
	}

	var file ghFileResponse
	if err := json.Unmarshal(data, &file); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return file.SHA, nil
}

// WriteFile creates or updates a file in the repo with a commit message.
func (c *Client) WriteFile(ctx context.Context, path, content, commitMsg string) error {
	sha, err := c.getFileSHA(ctx, path)
	if err != nil {
		return fmt.Errorf("get file SHA: %w", err)
	}

	_, branch, _, _ := c.snapshot()
	payload := map[string]interface{}{
		"message": commitMsg,
		"content": base64.StdEncoding.EncodeToString([]byte(content)),
		"branch":  branch,
		"committer": map[string]string{
			"name":  "recif-api",
			"email": "api@recif.dev",
		},
	}
	if sha != "" {
		payload["sha"] = sha
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	data, status, err := c.doRequest(ctx, http.MethodPut, c.contentsURL(path), bytes.NewReader(body))
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusCreated {
		return fmt.Errorf("github API error (status %d): %s", status, string(data))
	}
	return nil
}

// ListFiles lists file names in a directory.
func (c *Client) ListFiles(ctx context.Context, dirPath string) ([]string, error) {
	_, branch, _, _ := c.snapshot()
	url := c.contentsURL(dirPath) + "?ref=" + branch
	data, status, err := c.doRequest(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return nil, nil // directory does not exist yet
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("github API error (status %d): %s", status, string(data))
	}

	var entries []ghDirEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("decode directory listing: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name)
	}
	return names, nil
}

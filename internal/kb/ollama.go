package kb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

var ollamaBaseURL = getOllamaURL()

type ollamaEmbedRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

type ollamaEmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

// embedText dispatches to the right embedding backend based on the model name.
func embedText(ctx context.Context, model, text string) ([]float32, error) {
	if strings.HasPrefix(model, "text-embedding-") || strings.HasPrefix(model, "text-multilingual-embedding-") {
		return vertexEmbedText(ctx, model, text)
	}
	return ollamaEmbedText(ctx, model, text)
}

// ollamaEmbedText calls the Ollama /api/embed endpoint.
func ollamaEmbedText(ctx context.Context, model, text string) ([]float32, error) {
	body, err := json.Marshal(ollamaEmbedRequest{Model: model, Input: text})
	if err != nil {
		return nil, fmt.Errorf("marshal embed request: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ollamaBaseURL+"/api/embed", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call ollama embed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama embed returned status %d", resp.StatusCode)
	}

	var result ollamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode embed response: %w", err)
	}

	if len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("ollama returned no embeddings")
	}

	return result.Embeddings[0], nil
}

func getOllamaURL() string {
	if v := os.Getenv("OLLAMA_BASE_URL"); v != "" {
		return v
	}
	return "http://localhost:11434"
}

package kb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// vertexEmbedText calls the Vertex AI text-embedding API to generate an
// embedding for the given text. Uses the same service account auth as the
// Corail agent runtime (GOOGLE_APPLICATION_CREDENTIALS).

var (
	vertexTokenCache   string
	vertexTokenExpiry  time.Time
	vertexTokenMu      sync.Mutex
	vertexCredsCache   *gcpCredentials
)

type vertexPredictRequest struct {
	Instances []vertexInstance `json:"instances"`
}

type vertexInstance struct {
	Content string `json:"content"`
}

type vertexPredictResponse struct {
	Predictions []struct {
		Embeddings struct {
			Values []float32 `json:"values"`
		} `json:"embeddings"`
	} `json:"predictions"`
}

func vertexEmbedText(ctx context.Context, model, text string) ([]float32, error) {
	project := os.Getenv("GOOGLE_CLOUD_PROJECT")
	location := os.Getenv("GOOGLE_CLOUD_LOCATION")
	if location == "" {
		location = "us-central1"
	}

	// Auto-detect project from credentials if not set
	if project == "" {
		creds, err := loadGCPCredentials()
		if err == nil {
			project = creds.ProjectID
		}
	}
	if project == "" {
		return nil, fmt.Errorf("GOOGLE_CLOUD_PROJECT not set for Vertex AI embeddings")
	}

	token, err := getVertexToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get vertex token: %w", err)
	}

	url := fmt.Sprintf(
		"https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:predict",
		location, project, location, model,
	)

	body, err := json.Marshal(vertexPredictRequest{
		Instances: []vertexInstance{{Content: text}},
	})
	if err != nil {
		return nil, fmt.Errorf("marshal vertex embed request: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create vertex request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call vertex embed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vertex embed returned status %d for model %s", resp.StatusCode, model)
	}

	var result vertexPredictResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode vertex response: %w", err)
	}

	if len(result.Predictions) == 0 {
		return nil, fmt.Errorf("vertex returned no predictions")
	}

	return result.Predictions[0].Embeddings.Values, nil
}

type gcpCredentials struct {
	Type         string `json:"type"`
	ProjectID    string `json:"project_id"`
	ClientEmail  string `json:"client_email"`
	PrivateKey   string `json:"private_key"`
}

func loadGCPCredentials() (*gcpCredentials, error) {
	// Credentials are static for the pod lifetime — cache after first read.
	if vertexCredsCache != nil {
		return vertexCredsCache, nil
	}
	path := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	if path == "" {
		return nil, fmt.Errorf("GOOGLE_APPLICATION_CREDENTIALS not set")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var creds gcpCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, err
	}
	vertexCredsCache = &creds
	return vertexCredsCache, nil
}

func getVertexToken(ctx context.Context) (string, error) {
	vertexTokenMu.Lock()
	defer vertexTokenMu.Unlock()

	if vertexTokenCache != "" && time.Now().Before(vertexTokenExpiry) {
		return vertexTokenCache, nil
	}

	creds, err := loadGCPCredentials()
	if err != nil {
		return "", err
	}

	if creds.Type != "service_account" {
		return "", fmt.Errorf("only service_account credentials are supported, got %s", creds.Type)
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss":   creds.ClientEmail,
		"sub":   creds.ClientEmail,
		"aud":   "https://oauth2.googleapis.com/token",
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
		"scope": "https://www.googleapis.com/auth/cloud-platform",
	}

	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(creds.PrivateKey))
	if err != nil {
		return "", fmt.Errorf("parse private key: %w", err)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(key)
	if err != nil {
		return "", fmt.Errorf("sign jwt: %w", err)
	}

	// Exchange JWT for access token
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", map[string][]string{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {signed},
	})
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}

	vertexTokenCache = tokenResp.AccessToken
	vertexTokenExpiry = now.Add(55 * time.Minute)

	return vertexTokenCache, nil
}

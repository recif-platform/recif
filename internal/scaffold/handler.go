package scaffold

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/sciences44/recif/internal/httputil"
)

// ScaffoldRequest is the JSON body for POST /api/v1/scaffold.
type ScaffoldRequest struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	AgentType    string   `json:"agent_type"`
	Framework    string   `json:"framework"`
	Capabilities []string `json:"capabilities"`
	Delivery     Delivery `json:"delivery"`
}

// Delivery describes how the scaffold should be delivered.
type Delivery struct {
	Method      string `json:"method"`
	GithubToken string `json:"github_token,omitempty"`
	GithubOrg   string `json:"github_org,omitempty"`
	RepoName    string `json:"repo_name,omitempty"`
}

// Handler provides HTTP handlers for agent scaffolding.
type Handler struct {
	logger *slog.Logger
}

// NewHandler creates a new scaffold Handler.
func NewHandler(logger *slog.Logger) *Handler {
	return &Handler{logger: logger}
}

// Generate handles POST /api/v1/scaffold.
func (h *Handler) Generate(w http.ResponseWriter, r *http.Request) {
	var req ScaffoldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", "name is required", r.URL.Path)
		return
	}

	tmpl, ok := LookupTemplate(req.Framework)
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "Unknown Framework", fmt.Sprintf("framework %q is not supported", req.Framework), r.URL.Path)
		return
	}

	h.logger.Info("scaffold requested",
		"name", req.Name,
		"framework", req.Framework,
		"delivery", req.Delivery.Method,
		"capabilities", req.Capabilities,
	)

	switch req.Delivery.Method {
	case "github":
		h.handleGitHub(w, r, req, tmpl)
	case "zip":
		h.handleZip(w, r, req, tmpl)
	default:
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Delivery", fmt.Sprintf("delivery method %q is not supported", req.Delivery.Method), r.URL.Path)
	}
}

func (h *Handler) handleGitHub(w http.ResponseWriter, r *http.Request, req ScaffoldRequest, _ FrameworkTemplate) {
	// Mock response — real implementation would call GitHub API
	repoURL := fmt.Sprintf("https://github.com/%s/%s", req.Delivery.GithubOrg, req.Delivery.RepoName)

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{
		"status":   "created",
		"repo_url": repoURL,
		"message":  "Repository created with scaffold",
	})
}

func (h *Handler) handleZip(w http.ResponseWriter, _ *http.Request, req ScaffoldRequest, tmpl FrameworkTemplate) {
	buf, err := buildZip(req.Name, req.Framework, req.Description, req.Capabilities, tmpl)
	if err != nil {
		h.logger.Error("failed to build zip", "error", err)
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", req.Name+".zip"))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

func buildZip(name, framework, description string, capabilities []string, tmpl FrameworkTemplate) (*bytes.Buffer, error) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	files := map[string]string{
		name + "/README.md":                      readmeContent(name, framework, capabilities),
		name + "/Dockerfile":                     tmpl.Dockerfile,
		name + "/.github/workflows/deploy.yml":   tmpl.DeployYAML,
		name + "/src/agent.py":                   tmpl.AgentPy,
		name + "/src/config.py":                  configPy(capabilities),
		name + "/requirements.txt":               tmpl.Requirements,
		name + "/recif.yaml":                     recifYAML(name, framework, capabilities),
		name + "/eval/golden.jsonl":              goldenJSONL(),
	}

	for path, content := range files {
		fw, err := zw.Create(path)
		if err != nil {
			return nil, fmt.Errorf("create zip entry %s: %w", path, err)
		}
		if _, err := fw.Write([]byte(content)); err != nil {
			return nil, fmt.Errorf("write zip entry %s: %w", path, err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("close zip: %w", err)
	}

	return buf, nil
}

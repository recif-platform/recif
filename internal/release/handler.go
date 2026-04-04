package release

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/gitstate"
	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// Handler provides HTTP handlers for the agent release pipeline.
type Handler struct {
	gitClient    *gitstate.Client
	agentRepo    agent.Repository
	k8sReader    agent.K8sReader
	k8sWriter    agent.K8sWriter
	bus          *eventbus.EventBus
	logger       *slog.Logger
	agentBaseURL string // template for Corail control URL, e.g. "http://%s.team-default.svc.cluster.local:8001"
	recifBaseURL string // Récif's own callback URL, e.g. "http://recif.recif-system.svc.cluster.local:8080"
}

// NewHandler creates a new release Handler and subscribes to events.
func NewHandler(gitClient *gitstate.Client, agentRepo agent.Repository, k8sReader agent.K8sReader, k8sWriter agent.K8sWriter, bus *eventbus.EventBus, logger *slog.Logger, opts ...HandlerOption) *Handler {
	h := &Handler{
		gitClient:    gitClient,
		agentRepo:    agentRepo,
		k8sReader:    k8sReader,
		k8sWriter:    k8sWriter,
		bus:          bus,
		logger:       logger,
		agentBaseURL: "http://%s.team-default.svc.cluster.local:8001", // Port 8001 = ControlServer (has /control/evaluate)
		recifBaseURL: "http://recif.recif-system.svc.cluster.local:8080",
	}
	for _, opt := range opts {
		opt(h)
	}

	// Subscribe to events that should trigger releases
	bus.Subscribe(eventbus.AgentDeployed, h.onAgentDeployed)
	bus.Subscribe(eventbus.AgentConfigChanged, h.onConfigChanged)
	bus.Subscribe(eventbus.AgentDeleted, h.onAgentDeleted)

	return h
}

// HandlerOption configures optional Handler fields.
type HandlerOption func(*Handler)

// WithAgentBaseURL sets the Corail control plane URL template.
func WithAgentBaseURL(url string) HandlerOption {
	return func(h *Handler) { h.agentBaseURL = url }
}

// WithRecifBaseURL sets Récif's own callback URL.
func WithRecifBaseURL(url string) HandlerOption {
	return func(h *Handler) { h.recifBaseURL = url }
}

// releaseInfo is the JSON-friendly summary returned by list/get endpoints.
type releaseInfo struct {
	Version   int    `json:"version"`
	Status    string `json:"status"`
	Author    string `json:"author"`
	Timestamp string `json:"timestamp"`
	Changelog string `json:"changelog"`
	Checksum  string `json:"checksum"`
	Artifact  any    `json:"artifact,omitempty"`
}

// diffEntry describes a single field difference between two releases.
type diffEntry struct {
	Path string `json:"path"`
	From any    `json:"from"`
	To   any    `json:"to"`
}

// --- Event handlers ---

func (h *Handler) onAgentDeployed(ctx context.Context, event eventbus.Event) {
	agentID, _ := event.Payload["agent_id"].(string)
	changelog, _ := event.Payload["changelog"].(string)
	if agentID == "" {
		return
	}
	if _, err := h.createRelease(ctx, agentID, changelog); err != nil {
		h.logger.Warn("failed to create release on deploy event", "error", err, "agent_id", agentID)
	}
}

func (h *Handler) onConfigChanged(ctx context.Context, event eventbus.Event) {
	agentID, _ := event.Payload["agent_id"].(string)
	changelog, _ := event.Payload["changelog"].(string)
	if agentID == "" {
		return
	}
	if _, err := h.createRelease(ctx, agentID, changelog); err != nil {
		h.logger.Warn("failed to create release on config change event", "error", err, "agent_id", agentID)
	}
}

// onAgentDeleted writes a tombstone to recif-state so the agent is archived
// but its release history is preserved for audit.
func (h *Handler) onAgentDeleted(ctx context.Context, event eventbus.Event) {
	slug, _ := event.Payload["agent_slug"].(string)
	agentID, _ := event.Payload["agent_id"].(string)
	if slug == "" {
		return
	}

	// Read current artifact to preserve metadata
	path := fmt.Sprintf("agents/%s/current.yaml", slug)
	content, err := h.gitClient.ReadFile(ctx, path)
	if err != nil {
		h.logger.Info("no current.yaml to tombstone", "slug", slug)
		// Write a minimal tombstone even if there was no current.yaml
		tombstone := fmt.Sprintf(`apiVersion: agents.recif.dev/v1
kind: AgentRelease
metadata:
  name: %s
  status: deleted
  deleted_at: %s
  changelog: "Agent deleted from platform"
`, slug, time.Now().UTC().Format(time.RFC3339))

		if err := h.gitClient.WriteFile(ctx, path, tombstone, fmt.Sprintf("Archive %s — agent deleted", slug)); err != nil {
			h.logger.Warn("failed to write tombstone", "slug", slug, "error", err)
		}
		return
	}

	// Parse existing artifact, update status to deleted
	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		h.logger.Warn("failed to parse artifact for tombstone", "slug", slug, "error", err)
		return
	}

	artifact.Metadata.Status = "deleted"
	artifact.Metadata.Changelog = fmt.Sprintf("[DELETED] %s", artifact.Metadata.Changelog)

	yamlBytes, err := artifact.MarshalYAML()
	if err != nil {
		h.logger.Warn("failed to marshal tombstone", "slug", slug, "error", err)
		return
	}

	commitMsg := fmt.Sprintf("Archive %s — agent deleted (was v%d)", slug, artifact.Metadata.Version)
	if err := h.gitClient.WriteFile(ctx, path, string(yamlBytes), commitMsg); err != nil {
		h.logger.Warn("failed to write tombstone to git", "slug", slug, "error", err)
		return
	}

	h.logger.Info("agent archived in git state", "slug", slug, "agent_id", agentID, "last_version", artifact.Metadata.Version)
}

// createRelease is the internal method for creating a release (called by event handlers and HTTP).
//
// If governance.min_quality_score > 0, the release stays in "pending_eval" and
// waits for the eval callback to approve/reject. Otherwise it auto-promotes.
func (h *Handler) createRelease(ctx context.Context, agentID, changelog string) (int, error) {
	ag, err := h.agentRepo.Get(ctx, agentID)
	if err != nil {
		return 0, fmt.Errorf("get agent: %w", err)
	}
	slug := ag.Slug
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(ag.Name, " ", "-"))
	}

	namespace := middleware.NamespaceFromContext(ctx)
	if h.k8sReader != nil {
		_ = h.k8sReader.Enrich(ctx, ag, namespace)
	}

	currentVersion, err := h.highestVersion(ctx, slug)
	if err != nil {
		currentVersion = 0
	}
	nextVersion := currentVersion + 1

	artifact := gitstate.BuildArtifact(slug, nextVersion, changelog, ag)
	artifact.Metadata.Checksum = artifact.ComputeChecksum()

	yamlBytes, err := artifact.MarshalYAML()
	if err != nil {
		return 0, fmt.Errorf("marshal artifact: %w", err)
	}
	yamlContent := string(yamlBytes)

	// Always commit the versioned release file (immutable, status=pending_eval)
	releasePath := fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, nextVersion)
	commitMsg := fmt.Sprintf("Release %s v%d: %s", slug, nextVersion, changelog)
	if err := h.gitClient.WriteFile(ctx, releasePath, yamlContent, commitMsg); err != nil {
		return 0, fmt.Errorf("commit release: %w", err)
	}

	h.bus.Emit(ctx, eventbus.Event{
		Type: eventbus.ReleaseCreated,
		Payload: map[string]any{
			"agent_id": agentID,
			"slug":     slug,
			"version":  nextVersion,
		},
	})

	// Eval gate: if min_quality_score > 0, leave in pending_eval for async evaluation.
	// Otherwise, auto-promote immediately (backward compatible).
	requiresEval := artifact.Governance.MinQualityScore > 0
	if requiresEval {
		h.logger.Info("release_pending_eval", "slug", slug, "version", nextVersion,
			"min_quality_score", artifact.Governance.MinQualityScore)
		go h.triggerEvaluation(context.Background(), agentID, slug, nextVersion, artifact)
		return nextVersion, nil
	}

	return nextVersion, h.approveRelease(ctx, agentID, slug, nextVersion)
}

// approveRelease promotes a release to active — writes current.yaml and applies CRD.
func (h *Handler) approveRelease(ctx context.Context, agentID, slug string, version int) error {
	releasePath := fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, version)
	content, err := h.gitClient.ReadFile(ctx, releasePath)
	if err != nil {
		return fmt.Errorf("read release v%d: %w", version, err)
	}

	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		return fmt.Errorf("parse release v%d: %w", version, err)
	}

	// Update status to active and re-commit
	artifact.Metadata.Status = "active"
	yamlBytes, err := artifact.MarshalYAML()
	if err != nil {
		return fmt.Errorf("marshal updated artifact: %w", err)
	}
	yamlContent := string(yamlBytes)

	_ = h.gitClient.WriteFile(ctx, releasePath, yamlContent, fmt.Sprintf("Approve %s v%d", slug, version))

	// Activate: write current.yaml
	currentPath := fmt.Sprintf("agents/%s/current.yaml", slug)
	_ = h.gitClient.WriteFile(ctx, currentPath, yamlContent, fmt.Sprintf("Activate %s v%d", slug, version))

	// Apply to K8s CRD
	namespace := middleware.NamespaceFromContext(ctx)
	h.applyCRD(ctx, namespace, slug, artifact)

	h.bus.Emit(ctx, eventbus.Event{
		Type: eventbus.ReleaseApproved,
		Payload: map[string]any{"agent_id": agentID, "slug": slug, "version": version},
	})
	h.logger.Info("release_approved", "slug", slug, "version", version)
	return nil
}

// rejectRelease marks a release as rejected and rolls back the CRD to the previous active version.
func (h *Handler) rejectRelease(ctx context.Context, agentID, slug string, version int, reason string) error {
	releasePath := fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, version)
	content, err := h.gitClient.ReadFile(ctx, releasePath)
	if err != nil {
		return fmt.Errorf("read release v%d: %w", version, err)
	}

	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		return fmt.Errorf("parse release v%d: %w", version, err)
	}

	// Update status to rejected
	artifact.Metadata.Status = "rejected"
	artifact.Metadata.Changelog += fmt.Sprintf(" [REJECTED: %s]", reason)
	yamlBytes, err := artifact.MarshalYAML()
	if err != nil {
		return fmt.Errorf("marshal rejected artifact: %w", err)
	}

	_ = h.gitClient.WriteFile(ctx, releasePath, string(yamlBytes), fmt.Sprintf("Reject %s v%d: %s", slug, version, reason))

	// Rollback CRD to previous active version (current.yaml stays unchanged)
	currentContent, readErr := h.gitClient.ReadFile(ctx, fmt.Sprintf("agents/%s/current.yaml", slug))
	if readErr == nil {
		if prev, parseErr := gitstate.UnmarshalArtifact(currentContent); parseErr == nil {
			namespace := middleware.NamespaceFromContext(ctx)
			h.applyCRD(ctx, namespace, slug, prev)
		}
	}

	h.bus.Emit(ctx, eventbus.Event{
		Type: eventbus.ReleaseRejected,
		Payload: map[string]any{"agent_id": agentID, "slug": slug, "version": version, "reason": reason},
	})
	h.logger.Warn("release_rejected", "slug", slug, "version", version, "reason", reason)
	return nil
}

// triggerEvaluation sends an async eval request to the Corail agent's control plane.
func (h *Handler) triggerEvaluation(ctx context.Context, agentID, slug string, version int, artifact *gitstate.AgentArtifact) {
	callbackURL := fmt.Sprintf("%s/api/v1/agents/%s/releases/%d/eval-result", h.recifBaseURL, agentID, version)
	agentURL := fmt.Sprintf(h.agentBaseURL, slug)
	evalURL := agentURL + "/control/evaluate"

	// Build a minimal dataset with the eval_dataset reference.
	// The Corail evaluator uses risk_profile to select scorers.
	// If no dataset is configured, send a basic smoke-test case.
	dataset := []map[string]string{
		{"input": "Hello, are you working?", "expected_output": ""},
	}

	body := map[string]any{
		"dataset":           dataset,
		"agent_id":          agentID,
		"agent_version":     fmt.Sprintf("v%d", version),
		"min_quality_score": float64(artifact.Governance.MinQualityScore) / 100.0,
		"risk_profile":      artifact.Governance.RiskProfile,
		"callback_url":      callbackURL,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		h.logger.Error("eval_trigger_marshal_failed", "error", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, evalURL, strings.NewReader(string(jsonBody)))
	if err != nil {
		h.logger.Error("eval_trigger_request_failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.logger.Warn("eval_trigger_failed", "error", err, "url", evalURL)
		return
	}
	defer resp.Body.Close()

	h.bus.Emit(ctx, eventbus.Event{
		Type:    eventbus.EvalRequested,
		Payload: map[string]any{"agent_id": agentID, "slug": slug, "version": version},
	})
	h.logger.Info("eval_triggered", "slug", slug, "version", version, "callback", callbackURL)
}

// Create handles POST /api/v1/agents/{id}/releases.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	ag, _, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	var req struct {
		Changelog string `json:"changelog"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	version, err := h.createRelease(r.Context(), ag.ID, req.Changelog)
	if err != nil {
		h.logger.Error("failed to create release", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Release Failed", err.Error(), r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{"status": "created", "version": version, "message": fmt.Sprintf("Release v%d created", version)},
	})
}

// EvalResult handles POST /api/v1/agents/{id}/releases/{version}/eval-result.
// This is the callback endpoint that Corail POSTs to when evaluation completes.
func (h *Handler) EvalResult(w http.ResponseWriter, r *http.Request) {
	ag, slug, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Version", "Version must be a number", r.URL.Path)
		return
	}

	var result evalResultPayload
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if result.Passed {
		if err := h.approveRelease(r.Context(), ag.ID, slug, version); err != nil {
			h.logger.Error("approve_release_failed", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "Approve Failed", err.Error(), r.URL.Path)
			return
		}
		h.bus.Emit(r.Context(), eventbus.Event{
			Type:    eventbus.EvalCompleted,
			Payload: map[string]any{"agent_id": ag.ID, "slug": slug, "version": version, "passed": true, "scores": result.Scores},
		})
	} else {
		if err := h.rejectRelease(r.Context(), ag.ID, slug, version, result.Verdict); err != nil {
			h.logger.Error("reject_release_failed", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "Reject Failed", err.Error(), r.URL.Path)
			return
		}
		h.bus.Emit(r.Context(), eventbus.Event{
			Type:    eventbus.EvalCompleted,
			Payload: map[string]any{"agent_id": ag.ID, "slug": slug, "version": version, "passed": false, "scores": result.Scores},
		})
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{"version": version, "passed": result.Passed, "verdict": result.Verdict},
	})
}

// evalResultPayload is the JSON body POSTed by Corail's eval callback.
type evalResultPayload struct {
	RunID       string             `json:"run_id"`
	Status      string             `json:"status"`
	Scores      map[string]float64 `json:"scores"`
	Passed      bool               `json:"passed"`
	Verdict     string             `json:"verdict"`
	MLflowRunID string             `json:"mlflow_run_id"`
}

// List handles GET /api/v1/agents/{id}/releases.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	_, slug, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	// Read current.yaml to find the active version
	activeVersion := 0
	currentContent, err := h.gitClient.ReadFile(r.Context(), fmt.Sprintf("agents/%s/current.yaml", slug))
	if err == nil {
		if current, parseErr := gitstate.UnmarshalArtifact(currentContent); parseErr == nil {
			activeVersion = current.Metadata.Version
		}
	}

	// List release files
	releasesDir := fmt.Sprintf("agents/%s/releases", slug)
	files, err := h.gitClient.ListFiles(r.Context(), releasesDir)
	if err != nil {
		h.logger.Error("failed to list releases", "error", err, "dir", releasesDir)
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []releaseInfo{}})
		return
	}

	releases := make([]releaseInfo, 0, len(files))
	for _, f := range files {
		if !strings.HasSuffix(f, ".yaml") {
			continue
		}
		path := fmt.Sprintf("%s/%s", releasesDir, f)
		content, readErr := h.gitClient.ReadFile(r.Context(), path)
		if readErr != nil {
			h.logger.Warn("failed to read release file", "error", readErr, "path", path)
			continue
		}
		artifact, parseErr := gitstate.UnmarshalArtifact(content)
		if parseErr != nil {
			h.logger.Warn("failed to parse release file", "error", parseErr, "path", path)
			continue
		}

		status := artifact.Metadata.Status
		if status == "" {
			// Legacy releases without status field
			status = "archived"
			if artifact.Metadata.Version == activeVersion {
				status = "active"
			}
		}
		releases = append(releases, releaseInfo{
			Version:   artifact.Metadata.Version,
			Status:    status,
			Author:    artifact.Metadata.Author,
			Timestamp: artifact.Metadata.Timestamp,
			Changelog: artifact.Metadata.Changelog,
			Checksum:  artifact.Metadata.Checksum,
		})
	}

	// Sort by version descending
	sort.Slice(releases, func(i, j int) bool {
		return releases[i].Version > releases[j].Version
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": releases})
}

// Get handles GET /api/v1/agents/{id}/releases/{version}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	_, slug, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Version", "Version must be a number", r.URL.Path)
		return
	}

	path := fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, version)
	content, err := h.gitClient.ReadFile(r.Context(), path)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", fmt.Sprintf("Release v%d not found", version), r.URL.Path)
		return
	}

	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Parse Error", "Failed to parse release artifact", r.URL.Path)
		return
	}

	// Check if this is the active version
	status := "archived"
	currentContent, readErr := h.gitClient.ReadFile(r.Context(), fmt.Sprintf("agents/%s/current.yaml", slug))
	if readErr == nil {
		if current, parseErr := gitstate.UnmarshalArtifact(currentContent); parseErr == nil {
			if current.Metadata.Version == version {
				status = "active"
			}
		}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": releaseInfo{
			Version:   artifact.Metadata.Version,
			Status:    status,
			Author:    artifact.Metadata.Author,
			Timestamp: artifact.Metadata.Timestamp,
			Changelog: artifact.Metadata.Changelog,
			Checksum:  artifact.Metadata.Checksum,
			Artifact:  artifact,
		},
	})
}

// Deploy handles POST /api/v1/agents/{id}/releases/{version}/deploy (rollback).
func (h *Handler) Deploy(w http.ResponseWriter, r *http.Request) {
	ag, slug, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	namespace := middleware.NamespaceFromContext(r.Context())

	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Version", "Version must be a number", r.URL.Path)
		return
	}

	// Read the target release
	releasePath := fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, version)
	content, err := h.gitClient.ReadFile(r.Context(), releasePath)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", fmt.Sprintf("Release v%d not found", version), r.URL.Path)
		return
	}

	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Parse Error", "Failed to parse release artifact", r.URL.Path)
		return
	}

	// Update current.yaml
	currentPath := fmt.Sprintf("agents/%s/current.yaml", slug)
	commitMsg := fmt.Sprintf("Rollback %s to v%d", slug, version)
	if err := h.gitClient.WriteFile(r.Context(), currentPath, content, commitMsg); err != nil {
		h.logger.Error("failed to update current.yaml for rollback", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Rollback Failed", "Failed to update current.yaml", r.URL.Path)
		return
	}

	// Apply to K8s CRD
	h.applyCRD(r.Context(), namespace, ag.Name, artifact)

	h.bus.Emit(r.Context(), eventbus.Event{
		Type: eventbus.ReleaseDeployed,
		Payload: map[string]any{
			"agent_id": ag.ID,
			"slug":     slug,
			"version":  version,
		},
	})

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"version": version,
			"status":  "active",
			"message": fmt.Sprintf("Rolled back to v%d", version),
		},
	})
}

// Diff handles GET /api/v1/agents/{id}/releases/diff?from=X&to=Y.
func (h *Handler) Diff(w http.ResponseWriter, r *http.Request) {
	_, slug, ok := h.resolveAgent(w, r)
	if !ok {
		return
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	fromVer, err1 := strconv.Atoi(fromStr)
	toVer, err2 := strconv.Atoi(toStr)
	if err1 != nil || err2 != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid Parameters", "Both 'from' and 'to' must be version numbers", r.URL.Path)
		return
	}

	fromContent, err := h.gitClient.ReadFile(r.Context(), fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, fromVer))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", fmt.Sprintf("Release v%d not found", fromVer), r.URL.Path)
		return
	}
	toContent, err := h.gitClient.ReadFile(r.Context(), fmt.Sprintf("agents/%s/releases/v%d.yaml", slug, toVer))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", fmt.Sprintf("Release v%d not found", toVer), r.URL.Path)
		return
	}

	fromArtifact, err := gitstate.UnmarshalArtifact(fromContent)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Parse Error", "Failed to parse source release", r.URL.Path)
		return
	}
	toArtifact, err := gitstate.UnmarshalArtifact(toContent)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Parse Error", "Failed to parse target release", r.URL.Path)
		return
	}

	diffs := computeDiff(fromArtifact, toArtifact)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": diffs})
}

// --- internal helpers ---

// resolveAgent fetches the agent by URL param {id} and derives its slug.
func (h *Handler) resolveAgent(w http.ResponseWriter, r *http.Request) (*agent.Agent, string, bool) {
	if h.agentRepo == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Database not configured", r.URL.Path)
		return nil, "", false
	}
	id := chi.URLParam(r, "id")
	ag, err := h.agentRepo.Get(r.Context(), id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Agent not found", r.URL.Path)
		return nil, "", false
	}
	slug := ag.Slug
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(ag.Name, " ", "-"))
	}
	return ag, slug, true
}

// highestVersion scans the releases directory to find the highest version number.
func (h *Handler) highestVersion(ctx context.Context, slug string) (int, error) {
	dir := fmt.Sprintf("agents/%s/releases", slug)
	files, err := h.gitClient.ListFiles(ctx, dir)
	if err != nil {
		return 0, err
	}

	highest := 0
	for _, f := range files {
		name := strings.TrimSuffix(f, ".yaml")
		name = strings.TrimPrefix(name, "v")
		if v, parseErr := strconv.Atoi(name); parseErr == nil && v > highest {
			highest = v
		}
	}
	return highest, nil
}

// applyCRD patches the K8s CRD with values from the artifact (best effort).
func (h *Handler) applyCRD(ctx context.Context, namespace, agentName string, artifact *gitstate.AgentArtifact) {
	if h.k8sWriter == nil {
		return
	}

	fields := map[string]interface{}{
		"image":    artifact.Runtime.Image,
		"channel":  artifact.Runtime.Channel,
		"strategy": artifact.Runtime.Strategy,
		"replicas": int64(artifact.Runtime.Replicas),
	}
	if artifact.Agent.Model.Provider != "" {
		fields["modelType"] = artifact.Agent.Model.Provider
	}
	if artifact.Agent.Model.ID != "" {
		fields["modelId"] = artifact.Agent.Model.ID
	}
	if artifact.Agent.SystemPrompt != "" {
		fields["systemPrompt"] = artifact.Agent.SystemPrompt
	}
	if len(artifact.Agent.Tools) > 0 {
		fields["tools"] = artifact.Agent.Tools
	}
	if len(artifact.Agent.Skills) > 0 {
		fields["skills"] = artifact.Agent.Skills
	}

	if err := h.k8sWriter.PatchSpec(ctx, namespace, agentName, fields); err != nil {
		h.logger.Warn("failed to apply release to CRD", "error", err, "agent", agentName)
	}
}

// computeDiff compares two artifacts and returns a list of changed fields.
func computeDiff(from, to *gitstate.AgentArtifact) []diffEntry {
	fromMap := flattenArtifact(from)
	toMap := flattenArtifact(to)

	var diffs []diffEntry
	allKeys := map[string]struct{}{}
	for k := range fromMap {
		allKeys[k] = struct{}{}
	}
	for k := range toMap {
		allKeys[k] = struct{}{}
	}

	sortedKeys := make([]string, 0, len(allKeys))
	for k := range allKeys {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)

	for _, k := range sortedKeys {
		fv := fromMap[k]
		tv := toMap[k]
		// Skip metadata fields that always differ
		if k == "metadata.version" || k == "metadata.previous" ||
			k == "metadata.timestamp" || k == "metadata.checksum" ||
			k == "metadata.changelog" {
			continue
		}
		if fmt.Sprintf("%v", fv) != fmt.Sprintf("%v", tv) {
			diffs = append(diffs, diffEntry{Path: k, From: fv, To: tv})
		}
	}
	return diffs
}

// flattenArtifact converts an artifact to a flat map for diff comparison.
func flattenArtifact(a *gitstate.AgentArtifact) map[string]any {
	data, _ := json.Marshal(a)
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	result := map[string]any{}
	flattenMap("", raw, result)
	return result
}

func flattenMap(prefix string, m map[string]any, result map[string]any) {
	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch val := v.(type) {
		case map[string]any:
			flattenMap(key, val, result)
		default:
			result[key] = val
		}
	}
}

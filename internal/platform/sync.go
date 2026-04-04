package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/gitstate"
	"github.com/sciences44/recif/internal/httputil"
)

// SyncHandler pulls agent definitions from the state repo and creates/updates them.
type SyncHandler struct {
	platform  *Handler
	agentRepo agent.Repository
	k8sWriter agent.K8sWriter
	logger    *slog.Logger
}

// NewSyncHandler creates a sync handler.
func NewSyncHandler(platform *Handler, agentRepo agent.Repository, k8sWriter agent.K8sWriter, logger *slog.Logger) *SyncHandler {
	return &SyncHandler{
		platform:  platform,
		agentRepo: agentRepo,
		k8sWriter: k8sWriter,
		logger:    logger,
	}
}

type syncResult struct {
	Agent   string `json:"agent"`
	Action  string `json:"action"` // "created", "updated", "skipped", "error"
	Message string `json:"message,omitempty"`
}

// Sync reads agents from the state repo and creates/updates them in the platform.
func (s *SyncHandler) Sync(w http.ResponseWriter, r *http.Request) {
	cfg := s.platform.Config()
	if cfg.StateRepo == "" || cfg.StateToken == "" {
		httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "State repository or token not configured",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	client := gitstate.NewClient(cfg.StateRepo, cfg.StateBranch, cfg.StateToken)

	// List agent directories
	agentDirs, err := client.ListFiles(ctx, "agents")
	if err != nil {
		httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to list agents from repo: %v", err),
		})
		return
	}

	if len(agentDirs) == 0 {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"data": map[string]any{
				"synced":  0,
				"results": []syncResult{},
				"message": "No agents found in state repository",
			},
		})
		return
	}

	var results []syncResult
	synced := 0

	for _, slug := range agentDirs {
		result := s.syncAgent(ctx, client, slug)
		if result.Action == "created" || result.Action == "updated" {
			synced++
		}
		results = append(results, result)
	}

	s.logger.Info("state repo sync complete", "synced", synced, "total", len(agentDirs))

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"synced":  synced,
			"results": results,
		},
	})
}

func (s *SyncHandler) syncAgent(ctx context.Context, client *gitstate.Client, slug string) syncResult {
	// Read current.yaml
	content, err := client.ReadFile(ctx, fmt.Sprintf("agents/%s/current.yaml", slug))
	if err != nil {
		// No current.yaml — try listing releases to find the latest
		return syncResult{Agent: slug, Action: "skipped", Message: "No current.yaml found"}
	}

	artifact, err := gitstate.UnmarshalArtifact(content)
	if err != nil {
		return syncResult{Agent: slug, Action: "error", Message: fmt.Sprintf("Invalid artifact: %v", err)}
	}

	// Skip deleted/archived agents
	if artifact.Metadata.Status == "deleted" {
		return syncResult{Agent: slug, Action: "skipped", Message: "Agent deleted (tombstone)"}
	}

	// Check if agent exists in DB (search by slug across all teams)
	var existing *agent.Agent
	results, err := s.agentRepo.Search(ctx, slug, 10, 0)
	if err != nil {
		return syncResult{Agent: slug, Action: "error", Message: fmt.Sprintf("DB search failed: %v", err)}
	}
	for i := range results {
		if results[i].Slug == slug {
			existing = &results[i]
			break
		}
	}

	if existing != nil {
		// Update existing agent config
		updates := artifactToConfigMap(artifact)
		if err := s.agentRepo.UpdateConfig(ctx, existing.ID, updates); err != nil {
			return syncResult{Agent: slug, Action: "error", Message: fmt.Sprintf("DB update failed: %v", err)}
		}

		// Apply to K8s
		if s.k8sWriter != nil {
			s.applyToK8s(ctx, slug, artifact, existing, false)
		}

		return syncResult{Agent: slug, Action: "updated", Message: fmt.Sprintf("v%d synced", artifact.Metadata.Version)}
	}

	// Create new agent
	configJSON, _ := json.Marshal(artifactToConfigMap(artifact))
	created, err := s.agentRepo.Create(ctx, agent.CreateParams{
		ID:        "ag_" + ulid.Make().String(),
		TeamID:    "tk_DEFAULT000000000000000000",
		Name:      slug,
		Slug:      slug,
		Status:    agent.StatusActive,
		Framework: "corail",
		Version:   fmt.Sprintf("v%d", artifact.Metadata.Version),
		Config:    configJSON,
	})
	if err != nil {
		return syncResult{Agent: slug, Action: "error", Message: fmt.Sprintf("DB create failed: %v", err)}
	}

	// Apply to K8s
	if s.k8sWriter != nil {
		s.applyToK8s(ctx, slug, artifact, created, true)
	}

	return syncResult{Agent: slug, Action: "created", Message: fmt.Sprintf("v%d imported", artifact.Metadata.Version)}
}

func artifactToConfigMap(a *gitstate.AgentArtifact) map[string]any {
	return map[string]any{
		"model_type":    a.Agent.Model.Provider,
		"model_id":      a.Agent.Model.ID,
		"system_prompt":  a.Agent.SystemPrompt,
		"strategy":       a.Runtime.Strategy,
		"channel":        a.Runtime.Channel,
		"storage":        a.Agent.Memory.Backend,
		"image":          a.Runtime.Image,
		"tools":          a.Agent.Tools,
		"skills":         a.Agent.Skills,
		"knowledge_bases": a.Agent.KnowledgeBases,
	}
}

func (s *SyncHandler) applyToK8s(ctx context.Context, slug string, artifact *gitstate.AgentArtifact, ag *agent.Agent, isNew bool) {
	namespace := artifact.Deployment.Namespace
	if namespace == "" {
		namespace = "team-default"
	}

	spec := map[string]any{
		"modelType": artifact.Agent.Model.Provider,
		"modelId":   artifact.Agent.Model.ID,
		"channel":   artifact.Runtime.Channel,
		"strategy":  artifact.Runtime.Strategy,
		"storage":   artifact.Agent.Memory.Backend,
		"image":     artifact.Runtime.Image,
	}

	var err error
	if isNew {
		err = s.k8sWriter.CreateAgentCRD(ctx, namespace, slug, spec)
	} else {
		err = s.k8sWriter.PatchSpec(ctx, namespace, slug, spec)
	}
	if err != nil {
		s.logger.Warn("failed to apply agent to K8s", "slug", slug, "error", err)
	}
}

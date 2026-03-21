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

// SyncHandler pulls agent definitions from the state repo and syncs them to the DB.
// K8s reconciliation is handled by ArgoCD (reads manifest.yaml from state repo).
type SyncHandler struct {
	platform  *Handler
	agentRepo agent.Repository
	logger    *slog.Logger
}

// NewSyncHandler creates a sync handler.
func NewSyncHandler(platform *Handler, agentRepo agent.Repository, logger *slog.Logger) *SyncHandler {
	return &SyncHandler{
		platform:  platform,
		agentRepo: agentRepo,
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

	// List namespace directories under agents/
	nsDirs, err := client.ListFiles(ctx, "agents")
	if err != nil {
		httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("Failed to list namespaces from repo: %v", err),
		})
		return
	}

	if len(nsDirs) == 0 {
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

	for _, ns := range nsDirs {
		slugs, listErr := client.ListFiles(ctx, "agents/"+ns)
		if listErr != nil {
			s.logger.Warn("failed to list agents in namespace", "namespace", ns, "error", listErr)
			continue
		}
		for _, slug := range slugs {
			dir := gitstate.AgentDir(ns, slug)
			result := s.syncAgent(ctx, client, slug, dir)
			if result.Action == "created" || result.Action == "updated" {
				synced++
			}
			results = append(results, result)
		}
	}

	s.logger.Info("state repo sync complete", "synced", synced, "total", len(results))

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"synced":  synced,
			"results": results,
		},
	})
}

func (s *SyncHandler) syncAgent(ctx context.Context, client *gitstate.Client, slug, dir string) syncResult {
	// Read current.yaml
	content, err := client.ReadFile(ctx, dir+"/current.yaml")
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
	_ = created // DB record created; K8s reconciliation handled by ArgoCD

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


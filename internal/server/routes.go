package server

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

func (s *Server) routes() http.Handler {
	r := chi.NewRouter()

	// Middleware chain (outermost first)
	r.Use(chimw.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger(s.logger))
	r.Use(middleware.CORS)

	// Health endpoints (outside /api/v1)
	r.Get("/healthz", s.handleHealthz)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Public endpoints — no JWT required
		if s.authHandler != nil {
			r.Post("/auth/login", s.authHandler.Login)
			r.Post("/auth/register", s.authHandler.Register)
		}

		// All other routes require a valid JWT (or dev-mode bypass)
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(s.authProvider, s.cfg.AuthEnabled))

			r.Get("/health", s.handleHealth)

			// Auth — current user
			if s.authHandler != nil {
				r.Get("/auth/me", s.authHandler.Me)
				r.Patch("/auth/me", s.authHandler.UpdateMe)
				r.Post("/auth/me/password", s.authHandler.ChangePassword)
			}

			// Users (admin)
			if s.userHandler != nil {
				r.Get("/users", s.userHandler.List)
				r.Post("/users", s.userHandler.Create)
			}

			// Agent CRUD
			r.Post("/agents", s.agentHandler.Create)
			r.Get("/agents", s.agentHandler.List)
			r.Get("/agents/{id}", s.agentHandler.Get)
			r.Delete("/agents/{id}", s.agentHandler.Delete)
			r.Get("/agents/{id}/versions", s.agentHandler.ListVersions)
			r.Patch("/agents/{id}/status", s.agentHandler.UpdateStatus)

			// Agent config (separate handler)
			r.Patch("/agents/{id}/config", s.configHandler.UpdateConfig)
			r.Put("/agents/{id}/skills", s.configHandler.UpdateSkills)

			// Agent deployment (separate handler)
			r.Post("/agents/{id}/deploy", s.deployHandler.Deploy)
			r.Post("/agents/{id}/stop", s.deployHandler.Stop)
			r.Post("/agents/{id}/restart", s.deployHandler.Restart)
			r.Get("/agents/{id}/events", s.deployHandler.Events)

			// Canary deployments
			r.Post("/agents/{id}/canary", s.canaryHandler.Start)
			r.Get("/agents/{id}/canary", s.canaryHandler.Status)
			r.Patch("/agents/{id}/canary", s.canaryHandler.UpdateWeight)
			r.Post("/agents/{id}/canary/promote", s.canaryHandler.Promote)
			r.Post("/agents/{id}/canary/rollback", s.canaryHandler.Rollback)

			// Agent proxy (chat, conversations, memory)
			r.Post("/agents/{id}/chat", s.proxyHandler.Chat)
			r.Post("/agents/{id}/chat/stream", s.proxyHandler.ChatStream)
			r.Get("/agents/{id}/conversations", s.proxyHandler.Conversations)
			r.Get("/agents/{id}/conversations/{cid}", s.proxyHandler.ConversationDetail)
			r.Delete("/agents/{id}/conversations/{cid}", s.proxyHandler.DeleteConversation)
			r.Get("/agents/{id}/conversations/{cid}/status", s.proxyHandler.GenerationStatus)

			// Agent suggestions
			r.Get("/agents/{id}/suggestions", s.proxyHandler.Suggestions)

			// Agent memory
			r.Route("/agents/{id}/memory", func(r chi.Router) {
				r.Get("/", s.proxyHandler.ListMemories)
				r.Post("/", s.proxyHandler.StoreMemory)
				r.Get("/status", s.proxyHandler.MemoryStatus)
				r.Post("/search", s.proxyHandler.SearchMemories)
				r.Delete("/{mid}", s.proxyHandler.DeleteMemory)
			})

			// Releases
			r.Post("/agents/{id}/releases", s.releaseHandler.Create)
			r.Get("/agents/{id}/releases", s.releaseHandler.List)
			r.Get("/agents/{id}/releases/diff", s.releaseHandler.Diff)
			r.Get("/agents/{id}/releases/{version}", s.releaseHandler.Get)
			r.Post("/agents/{id}/releases/{version}/deploy", s.releaseHandler.Deploy)
			r.Post("/agents/{id}/releases/{version}/eval-result", s.releaseHandler.EvalResult)

			// Evaluations
			r.Get("/agents/{agent_id}/evaluations/compare", s.evalHandler.CompareEvals)
			r.Get("/agents/{agent_id}/evaluations", s.evalHandler.ListEvals)
			r.Post("/agents/{agent_id}/evaluations", s.evalHandler.TriggerEval)
			r.Get("/agents/{agent_id}/evaluations/{run_id}", s.evalHandler.GetEval)
			r.Get("/agents/{agent_id}/datasets", s.evalHandler.ListDatasets)
			r.Post("/agents/{agent_id}/datasets", s.evalHandler.CreateDataset)

			// Feedback
			r.Post("/feedback", s.feedbackHandler.Submit)

			// Webhooks (Flagger quality gate)
			r.Post("/webhooks/flagger", s.canaryHandler.FlaggerWebhook)

			// Knowledge Bases
			r.Get("/knowledge-bases", s.kbHandler.List)
			r.Post("/knowledge-bases", s.kbHandler.Create)
			r.Get("/knowledge-bases/{id}", s.kbHandler.Get)
			r.Delete("/knowledge-bases/{id}", s.kbHandler.Delete)
			r.Get("/knowledge-bases/{id}/documents", s.kbHandler.ListDocuments)
			r.Delete("/knowledge-bases/{id}/documents/{docId}", s.kbHandler.DeleteDocument)
			r.Post("/knowledge-bases/{id}/ingest", s.kbHandler.Ingest)
			r.Post("/knowledge-bases/{id}/search", s.kbHandler.Search)

			// Integrations
			r.Get("/integrations/types", s.integrationHandler.ListTypes)
			r.Get("/integrations", s.integrationHandler.List)
			r.Post("/integrations", s.integrationHandler.Create)
			r.Get("/integrations/{id}", s.integrationHandler.Get)
			r.Delete("/integrations/{id}", s.integrationHandler.Delete)
			r.Post("/integrations/{id}/test", s.integrationHandler.TestConnection)

			// Ollama — list locally available models
			r.Get("/ollama/models", s.handleOllamaModels)

			// Governance -- Scorecards & Policies
			r.Get("/risk-profiles", s.evalHandler.ListRiskProfiles)
			r.Get("/governance/scorecards", s.governanceHandler.ListScorecards)
			r.Get("/governance/scorecards/{agent_id}", s.governanceHandler.GetScorecard)
			r.Get("/governance/policies", s.governanceHandler.ListPolicies)
			r.Post("/governance/policies", s.governanceHandler.CreatePolicy)
			r.Put("/governance/policies/{id}", s.governanceHandler.UpdatePolicy)
			r.Delete("/governance/policies/{id}", s.governanceHandler.DeletePolicy)

			// AI Radar -- Monitoring
			r.Get("/radar", s.radarHandler.Overview)
			r.Get("/radar/alerts", s.radarHandler.AllAlerts)
			r.Get("/radar/{agent_id}", s.radarHandler.AgentDetail)
			r.Get("/radar/{agent_id}/alerts", s.radarHandler.AgentAlerts)

			// Skills
			r.Get("/skills", s.skillHandler.List)
			r.Post("/skills", s.skillHandler.Create)
			r.Post("/skills/import", s.skillHandler.Import)
			r.Put("/skills/{id}", s.skillHandler.Update)
			r.Delete("/skills/{id}", s.skillHandler.Delete)

			// Scaffold
			r.Post("/scaffold", s.scaffoldHandler.Generate)

			// Teams
			if s.teamHandler != nil {
				r.Get("/teams", s.teamHandler.List)
				r.Post("/teams", s.teamHandler.Create)
				r.Get("/teams/{teamId}", s.teamHandler.Get)
				r.Delete("/teams/{teamId}", s.teamHandler.Delete)
				r.Post("/teams/{teamId}/members", s.teamHandler.AddMember)
				r.Delete("/teams/{teamId}/members/{userId}", s.teamHandler.RemoveMember)
				r.Patch("/teams/{teamId}/members/{userId}", s.teamHandler.UpdateMemberRole)
			}

			// Platform config
			r.Get("/platform/config", s.platformHandler.Get)
			r.Put("/platform/config", s.platformHandler.Update)
			r.Post("/platform/config/test", s.platformHandler.TestConnection)
			r.Post("/platform/sync", s.syncHandler.Sync)

			// Admin
			r.Get("/admin/agents", s.agentHandler.List)
		})
	})

	return r
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

// handleOllamaModels proxies to the Ollama /api/tags endpoint to list locally available models.
func (s *Server) handleOllamaModels(w http.ResponseWriter, r *http.Request) {
	ollamaURL := os.Getenv("OLLAMA_BASE_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(ollamaURL + "/api/tags")
	if err != nil {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"models": []any{}, "error": "Ollama not reachable"})
		return
	}
	defer resp.Body.Close()

	var data struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"models": []any{}, "error": "Invalid Ollama response"})
		return
	}

	names := make([]string, len(data.Models))
	for i, m := range data.Models {
		names[i] = m.Name
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"models": names})
}

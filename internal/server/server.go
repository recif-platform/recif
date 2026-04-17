package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/auth"
	"github.com/sciences44/recif/internal/config"
	db "github.com/sciences44/recif/internal/db/generated"
	"github.com/sciences44/recif/internal/eval"
	"github.com/sciences44/recif/internal/eventbus"
	"github.com/sciences44/recif/internal/feedback"
	"github.com/sciences44/recif/internal/gitstate"
	"github.com/sciences44/recif/internal/governance"
	"github.com/sciences44/recif/internal/integration"
	"github.com/sciences44/recif/internal/kb"
	"github.com/sciences44/recif/internal/platform"
	"github.com/sciences44/recif/internal/prompt"
	"github.com/sciences44/recif/internal/radar"
	"github.com/sciences44/recif/internal/release"
	"github.com/sciences44/recif/internal/scaffold"
	"github.com/sciences44/recif/internal/skill"
	"github.com/sciences44/recif/internal/team"
	"github.com/sciences44/recif/internal/user"
)

// Server is the HTTP server for the Recif API.
type Server struct {
	cfg          config.Config
	http         *http.Server
	logger       *slog.Logger
	agentHandler       *agent.Handler
	deployHandler      *agent.DeployHandler
	configHandler      *agent.ConfigHandler
	canaryHandler      *agent.CanaryHandler
	proxyHandler       agent.ProxyHandlerI
	evalHandler        *eval.Handler
	feedbackHandler    *feedback.Handler
	kbHandler          *kb.Handler
	integrationHandler *integration.Handler
	governanceHandler  *governance.Handler
	radarHandler       *radar.Handler
	releaseHandler     *release.Handler
	scaffoldHandler    *scaffold.Handler
	skillHandler       *skill.Handler
	teamHandler        *team.Handler
	platformHandler    *platform.Handler
	syncHandler        *platform.SyncHandler
	promptHandler      *prompt.Handler
	authProvider       auth.AuthProvider
	authHandler        *auth.Handler
	userHandler        *user.Handler
}

// New creates a new Server with the given configuration and dependencies.
func New(cfg config.Config, logger *slog.Logger, agentRepo agent.Repository, kbStore *kb.Store, pool ...*pgxpool.Pool) *Server {
	jwtProvider := auth.NewLocalJWTProvider(cfg.JWTSecret, 24*time.Hour)

	// 1. Create shared services
	bus := eventbus.New(logger)
	k8sReader := agent.NewK8sClientReader(logger)
	k8sWriter := agent.NewK8sClientWriter(logger)
	gitClient := gitstate.NewClient(cfg.StateRepo, cfg.StateBranch, cfg.StateToken)
	if cfg.StateToken == "" {
		logger.Warn("RECIF_STATE_TOKEN not set — git-state disabled, releases will not be persisted to GitHub")
	}

	// Use gRPC proxy to Corail agents by default; fall back to HTTP proxy
	// if AGENT_GRPC_URL is explicitly set to empty.
	var proxyH agent.ProxyHandlerI
	if cfg.AgentGRPCURL != "" {
		logger.Info("using gRPC proxy for agent communication", "grpc_url_template", cfg.AgentGRPCURL)
		proxyH = agent.NewGrpcProxyHandler(logger, cfg.AgentGRPCURL)
	} else {
		logger.Info("using HTTP proxy for agent communication (fallback)", "base_url", cfg.AgentBaseURL)
		proxyH = agent.NewProxyHandler(logger, cfg.AgentBaseURL, k8sReader)
	}

	// 2. Create handlers with explicit deps
	agentHandler := agent.NewHandler(agentRepo, bus, k8sReader, k8sWriter, logger)
	deployHandler := agent.NewDeployHandler(agentRepo, k8sReader, k8sWriter, bus, logger)
	configHandler := agent.NewConfigHandler(agentRepo, k8sReader, k8sWriter, bus, logger)
	canaryHandler := agent.NewCanaryHandler(agentRepo, k8sReader, k8sWriter, gitClient, bus, logger, cfg.MLflowURI)
	// Release handler writes Git audit trail (one-way, no reconciliation back)
	releaseHandler := release.NewHandler(gitClient, agentRepo, k8sReader, k8sWriter, bus, logger,
		release.WithRecifBaseURL("http://localhost:"+cfg.Port),
	)

	// 3. No post-construction wiring needed -- events handle cross-cutting
	// Eval handler uses port 8001 (ControlServer) — not the channel port 8000
	evalHandler := eval.NewHandler(cfg.MLflowURI, logger)

	// Platform config handler (uses DB pool if available)
	var dbPool *pgxpool.Pool
	if len(pool) > 0 {
		dbPool = pool[0]
	}

	// Auth, user, team handlers (require database)
	var authH *auth.Handler
	var userH *user.Handler
	var teamH *team.Handler
	if dbPool != nil {
		q := db.New(dbPool)
		userRepo := user.NewRepository(q)
		authH = auth.NewHandler(userRepo, jwtProvider, logger)
		userH = user.NewHandler(userRepo, logger, func(ctx context.Context) bool {
			return auth.IsAdmin(auth.GetClaims(ctx))
		})
		teamH = team.NewHandler(team.NewPostgresRepository(q), logger)
	}
	platformHandler := platform.NewHandler(dbPool, cfg, logger)

	// Sync git client with DB-loaded config (token may be in DB but not in env)
	dbCfg := platformHandler.Config()
	if dbCfg.StateToken != "" && dbCfg.StateToken != cfg.StateToken {
		gitClient.UpdateConfig(dbCfg.StateRepo, dbCfg.StateBranch, dbCfg.StateToken)
		logger.Info("git client configured from DB", "repo", dbCfg.StateRepo)
	}

	// Start background health check for state repo connectivity
	platformHandler.StartHealthCheck()

	// Hot-swap git client when platform config is updated via UI
	platformHandler.SetOnUpdate(func(pc platform.PlatformConfig) {
		gitClient.UpdateConfig(pc.StateRepo, pc.StateBranch, pc.StateToken)
		logger.Info("platform config updated — git client reconfigured",
			"repo", pc.StateRepo, "branch", pc.StateBranch)
	})

	s := &Server{
		cfg:                cfg,
		logger:             logger,
		agentHandler:       agentHandler,
		deployHandler:      deployHandler,
		configHandler:      configHandler,
		canaryHandler:      canaryHandler,
		proxyHandler:       proxyH,
		evalHandler:        evalHandler,
		feedbackHandler:    feedback.NewHandler(cfg.MLflowURI, logger, evalHandler),
		kbHandler:          kb.NewHandler(kbStore, logger),
		integrationHandler: integration.NewHandler(logger),
		governanceHandler:  governance.NewHandler(agentRepo, logger, cfg.MLflowURI),
		radarHandler:       radar.NewHandler(agentRepo, logger),
		releaseHandler:     releaseHandler,
		scaffoldHandler:    scaffold.NewHandler(logger),
		skillHandler:       skill.NewHandler(logger),
		teamHandler:        teamH,
		platformHandler:    platformHandler,
		syncHandler:        platform.NewSyncHandler(platformHandler, agentRepo, logger),
		promptHandler:      prompt.NewHandler(cfg.MLflowURI, logger),
		authProvider:       jwtProvider,
		authHandler:        authH,
		userHandler:        userH,
	}

	router := s.routes()

	s.http = &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      0, // disabled for SSE streaming (chat can run indefinitely)
		IdleTimeout:       120 * time.Second,
	}

	return s
}

// Start begins listening for HTTP requests.
func (s *Server) Start(ctx context.Context) error {
	s.logger.Info("starting server", "port", s.cfg.Port, "auth_enabled", s.cfg.AuthEnabled)
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("listen: %w", err)
	}
	return nil
}

// Handler returns the HTTP handler for testing.
func (s *Server) Handler() http.Handler {
	return s.http.Handler
}

// Shutdown gracefully stops the server and cleans up connections.
func (s *Server) Shutdown(ctx context.Context) error {
	s.logger.Info("shutting down server")
	s.platformHandler.StopHealthCheck()
	if grpcProxy, ok := s.proxyHandler.(*agent.GrpcProxyHandler); ok {
		grpcProxy.Close()
	}
	return s.http.Shutdown(ctx)
}

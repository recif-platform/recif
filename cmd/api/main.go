package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/config"
	"github.com/sciences44/recif/internal/db"
	dbgen "github.com/sciences44/recif/internal/db/generated"
	"github.com/sciences44/recif/internal/kb"
	"github.com/sciences44/recif/internal/observability"
	"github.com/sciences44/recif/internal/server"
	"github.com/sciences44/recif/internal/user"
)

func main() {
	cfg := config.Load()
	logger := observability.SetupLogger(cfg.LogLevel, cfg.LogFormat)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var agentRepo agent.Repository
	var pool *pgxpool.Pool

	// Database is still needed for users, teams, API keys, evals, etc.
	if cfg.DatabaseURL != "" {
		logger.Info("running database migrations")
		if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
			logger.Error("migration failed", "error", err)
			os.Exit(1)
		}
		logger.Info("migrations complete")

		var err error
		pool, err = db.NewPool(ctx, cfg.DatabaseURL)
		if err != nil {
			logger.Error("database connection failed", "error", err)
			os.Exit(1)
		}
		defer pool.Close()
	}

	// Agent source of truth: K8s CRDs (API writes directly).
	// Git is used as an audit trail (one-way), not as a write path.
	teamNS := os.Getenv("RECIF_TEAM_NAMESPACE")
	if teamNS == "" {
		teamNS = "team-default"
	}
	if k8sRepo := agent.NewK8sRepository(logger, teamNS); k8sRepo != nil {
		agentRepo = k8sRepo
		logger.Info("agent repository: K8s CRDs")
	} else {
		logger.Error("agent repository: K8s unavailable — agents API will not work")
	}

	// Connect to corail_storage for knowledge base operations
	var kbStore *kb.Store
	if cfg.KBDatabaseURL != "" {
		// Run KB schema migration (separate DB, not managed by goose)
		if err := db.MigrateKB(ctx, cfg.KBDatabaseURL); err != nil {
			logger.Warn("KB migration failed — knowledge base endpoints may be unavailable", "error", err)
		} else {
			logger.Info("KB schema migration complete")
		}

		kbPool, err := db.NewPool(ctx, cfg.KBDatabaseURL)
		if err != nil {
			logger.Warn("KB database connection failed — knowledge base endpoints will be unavailable", "error", err)
		} else {
			defer kbPool.Close()
			kbStore = kb.NewStore(kbPool, cfg.KBDatabaseURL)
			logger.Info("KB database connected", "url", cfg.KBDatabaseURL)
		}
	}

	// Bootstrap admin user on first startup (only when DB is available and creds are configured).
	if pool != nil && cfg.AdminEmail != "" && cfg.AdminPassword != "" {
		bootstrapAdmin(ctx, pool, cfg, logger)
	}

	srv := server.New(cfg, logger, agentRepo, kbStore, pool)

	go func() {
		if err := srv.Start(ctx); err != nil {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
}

// bootstrapAdmin creates the first admin user if no users exist yet.
func bootstrapAdmin(ctx context.Context, pool *pgxpool.Pool, cfg config.Config, logger *slog.Logger) {
	repo := user.NewRepository(dbgen.New(pool))
	count, err := repo.Count(ctx)
	if err != nil {
		logger.Warn("could not check user count for bootstrap", "error", err)
		return
	}
	if count > 0 {
		return
	}

	id := fmt.Sprintf("us_%s", ulid.Make().String())
	if _, err := repo.Create(ctx, id, cfg.AdminEmail, cfg.AdminName, "admin", cfg.AdminPassword); err != nil {
		logger.Error("failed to bootstrap admin user", "error", err)
		return
	}
	logger.Info("admin user bootstrapped", "email", cfg.AdminEmail)
}

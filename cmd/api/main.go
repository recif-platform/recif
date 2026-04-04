package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sciences44/recif/internal/agent"
	"github.com/sciences44/recif/internal/config"
	"github.com/sciences44/recif/internal/db"
	dbgen "github.com/sciences44/recif/internal/db/generated"
	"github.com/sciences44/recif/internal/kb"
	"github.com/sciences44/recif/internal/observability"
	"github.com/sciences44/recif/internal/server"
)

func main() {
	cfg := config.Load()
	logger := observability.SetupLogger(cfg.LogLevel, cfg.LogFormat)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var agentRepo agent.Repository
	var pool *pgxpool.Pool

	if cfg.DatabaseURL != "" {
		// Run migrations
		logger.Info("running database migrations")
		if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
			logger.Error("migration failed", "error", err)
			os.Exit(1)
		}
		logger.Info("migrations complete")

		// Create DB pool
		var err error
		pool, err = db.NewPool(ctx, cfg.DatabaseURL)
		if err != nil {
			logger.Error("database connection failed", "error", err)
			os.Exit(1)
		}
		defer pool.Close()

		queries := dbgen.New(pool)
		agentRepo = agent.NewPostgresRepository(queries)
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

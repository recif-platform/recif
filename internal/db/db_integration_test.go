//go:build integration

package db_test

import (
	"context"
	"testing"

	"github.com/sciences44/recif/internal/db"
)

func TestNewPool(t *testing.T) {
	// This test requires a running PostgreSQL instance.
	// Run with: go test -tags=integration -run TestNewPool ./internal/db/
	// Set DATABASE_URL env var or use testcontainers.
	t.Skip("Requires running PostgreSQL — run with testcontainers or set DATABASE_URL")

	ctx := context.Background()
	pool, err := db.NewPool(ctx, "postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable")
	if err != nil {
		t.Fatalf("failed to create pool: %v", err)
	}
	defer pool.Close()
}

func TestMigrate(t *testing.T) {
	t.Skip("Requires running PostgreSQL — run with testcontainers or set DATABASE_URL")

	ctx := context.Background()
	err := db.Migrate(ctx, "postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable")
	if err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
}

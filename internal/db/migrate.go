package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"

	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migrate runs all pending database migrations.
func Migrate(ctx context.Context, databaseURL string) error {
	db, err := sql.Open("pgx/v5", databaseURL)
	if err != nil {
		return fmt.Errorf("open database for migration: %w", err)
	}
	defer func() { _ = db.Close() }()

	goose.SetBaseFS(migrations)

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}

// MigrateKB creates the knowledge-base tables in the corail_storage database.
// This runs outside goose because corail_storage is a separate database from
// the main recif DB that goose manages.
func MigrateKB(ctx context.Context, kbDatabaseURL string) error {
	conn, err := sql.Open("pgx/v5", kbDatabaseURL)
	if err != nil {
		return fmt.Errorf("open KB database for migration: %w", err)
	}
	defer func() { _ = conn.Close() }()

	const ddl = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT DEFAULT '',
    embedding_model TEXT DEFAULT 'nomic-embed-text',
    embedding_dim INT DEFAULT 768,
    chunk_size INT DEFAULT 512,
    chunk_overlap INT DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_team_id ON knowledge_bases(team_id);

CREATE TABLE IF NOT EXISTS kb_documents (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    page_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_kb_id ON kb_documents(kb_id);

CREATE TABLE IF NOT EXISTS kb_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    kb_id TEXT NOT NULL DEFAULT '',
    chunk_index INT NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_document_id ON kb_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON kb_chunks(kb_id);
`

	if _, err := conn.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("create KB tables: %w", err)
	}

	return nil
}

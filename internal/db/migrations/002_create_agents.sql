-- +goose Up
CREATE TABLE IF NOT EXISTS agents (
    id          VARCHAR(30)  PRIMARY KEY,
    team_id     VARCHAR(30)  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    description TEXT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'draft',
    framework   VARCHAR(50)  NOT NULL,
    config      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_agents_team_id ON agents(team_id);

-- +goose Down
DROP INDEX IF EXISTS idx_agents_team_id;
DROP TABLE IF EXISTS agents;

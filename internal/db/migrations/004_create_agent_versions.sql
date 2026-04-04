-- +goose Up
CREATE TABLE IF NOT EXISTS agent_versions (
    id         VARCHAR(30)  PRIMARY KEY,
    agent_id   VARCHAR(30)  NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    version    VARCHAR(20)  NOT NULL,
    config     JSONB        NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON agent_versions(agent_id);

-- +goose Down
DROP INDEX IF EXISTS idx_agent_versions_agent_id;
DROP TABLE IF EXISTS agent_versions;

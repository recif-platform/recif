-- +goose Up
CREATE TABLE IF NOT EXISTS api_keys (
    id          VARCHAR(30)  PRIMARY KEY,
    team_id     VARCHAR(30)  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    key_hash    VARCHAR(64)  NOT NULL UNIQUE,
    key_prefix  VARCHAR(20)  NOT NULL,
    scopes      TEXT[]       NOT NULL DEFAULT '{}',
    expires_at  TIMESTAMPTZ,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_team_id ON api_keys(team_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- +goose Down
DROP INDEX IF EXISTS idx_api_keys_key_hash;
DROP INDEX IF EXISTS idx_api_keys_team_id;
DROP TABLE IF EXISTS api_keys;

-- +goose Up
CREATE TABLE IF NOT EXISTS users (
    id         VARCHAR(30)  PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    role       VARCHAR(20)  NOT NULL DEFAULT 'developer',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_memberships (
    id         VARCHAR(30)  PRIMARY KEY,
    user_id    VARCHAR(30)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id    VARCHAR(30)  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role       VARCHAR(20)  NOT NULL DEFAULT 'developer',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_user_id ON team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON team_memberships(team_id);

-- +goose Down
DROP INDEX IF EXISTS idx_team_memberships_team_id;
DROP INDEX IF EXISTS idx_team_memberships_user_id;
DROP TABLE IF EXISTS team_memberships;
DROP TABLE IF EXISTS users;

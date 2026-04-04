-- +goose Up
CREATE TABLE IF NOT EXISTS golden_datasets (
    id          VARCHAR(30)  PRIMARY KEY,
    agent_id    VARCHAR(30)  NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    team_id     VARCHAR(30)  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golden_datasets_agent_id ON golden_datasets(agent_id);

CREATE TABLE IF NOT EXISTS dataset_scenarios (
    id               VARCHAR(30)  PRIMARY KEY,
    dataset_id       VARCHAR(30)  NOT NULL REFERENCES golden_datasets(id) ON DELETE CASCADE,
    input            TEXT         NOT NULL,
    expected_output  TEXT,
    expected_tools   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    conversation     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    sort_order       INT          NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_scenarios_dataset_id ON dataset_scenarios(dataset_id);

CREATE TABLE IF NOT EXISTS eval_runs (
    id            VARCHAR(30)  PRIMARY KEY,
    agent_id      VARCHAR(30)  NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    dataset_id    VARCHAR(30)  NOT NULL REFERENCES golden_datasets(id),
    team_id       VARCHAR(30)  NOT NULL REFERENCES teams(id),
    agent_version VARCHAR(20)  NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
    overall_score NUMERIC(5,2),
    scenario_results JSONB     NOT NULL DEFAULT '[]'::jsonb,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_agent_id ON eval_runs(agent_id);

CREATE TABLE IF NOT EXISTS risk_profiles (
    id              VARCHAR(30)  PRIMARY KEY,
    name            VARCHAR(50)  NOT NULL UNIQUE,
    min_score       NUMERIC(5,2) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default risk profiles
INSERT INTO risk_profiles (id, name, min_score, description)
VALUES
    ('rp_LOW0000000000000000000000', 'LOW', 60, 'Minimum quality bar'),
    ('rp_MED0000000000000000000000', 'MEDIUM', 75, 'Standard quality bar'),
    ('rp_HIG0000000000000000000000', 'HIGH', 90, 'Strict quality bar')
ON CONFLICT (name) DO NOTHING;

-- Add risk_profile_id to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS risk_profile_id VARCHAR(30) REFERENCES risk_profiles(id) DEFAULT 'rp_MED0000000000000000000000';

-- +goose Down
ALTER TABLE agents DROP COLUMN IF EXISTS risk_profile_id;
DROP TABLE IF EXISTS risk_profiles;
DROP TABLE IF EXISTS eval_runs;
DROP TABLE IF EXISTS dataset_scenarios;
DROP TABLE IF EXISTS golden_datasets;

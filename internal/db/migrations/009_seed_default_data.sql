-- +goose Up
-- Seed default team and admin user for first-time setup
INSERT INTO teams (id, name, slug)
VALUES ('tk_DEFAULT000000000000000000', 'Default', 'default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, name, role)
VALUES ('us_ADMIN00000000000000000000', 'admin@recif.dev', 'Admin', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_memberships (id, user_id, team_id, role)
VALUES ('tm_ADMIN00000000000000000000', 'us_ADMIN00000000000000000000', 'tk_DEFAULT000000000000000000', 'admin')
ON CONFLICT (user_id, team_id) DO NOTHING;

-- +goose Down
DELETE FROM team_memberships WHERE id = 'tm_ADMIN00000000000000000000';
DELETE FROM users WHERE id = 'us_ADMIN00000000000000000000';
DELETE FROM teams WHERE id = 'tk_DEFAULT000000000000000000';

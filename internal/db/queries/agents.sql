-- name: GetAgent :one
SELECT * FROM agents WHERE id = $1;

-- name: ListAgentsByTeam :many
SELECT * FROM agents
WHERE team_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CreateAgent :one
INSERT INTO agents (id, team_id, name, slug, description, status, framework, version, config)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: UpdateAgent :one
UPDATE agents
SET name = $2, slug = $3, description = $4, status = $5, framework = $6, version = $7, config = $8, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1;

-- name: ListAllAgents :many
SELECT * FROM agents
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: GetAgentBySlug :one
SELECT * FROM agents WHERE team_id = $1 AND slug = $2;

-- name: SearchAgents :many
SELECT * FROM agents
WHERE name ILIKE '%' || @query::text || '%' OR COALESCE(description, '') ILIKE '%' || @query::text || '%'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

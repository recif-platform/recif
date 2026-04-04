-- name: CreateAgentVersion :one
INSERT INTO agent_versions (id, agent_id, version, config)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListVersionsByAgent :many
SELECT * FROM agent_versions
WHERE agent_id = $1
ORDER BY created_at DESC;

-- name: GetLatestVersion :one
SELECT * FROM agent_versions
WHERE agent_id = $1
ORDER BY created_at DESC
LIMIT 1;

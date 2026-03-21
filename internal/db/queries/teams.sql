-- name: GetTeam :one
SELECT * FROM teams WHERE id = $1;

-- name: CreateTeam :one
INSERT INTO teams (id, name, slug)
VALUES ($1, $2, $3)
RETURNING *;

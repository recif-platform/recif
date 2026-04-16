-- name: GetTeam :one
SELECT t.*, COUNT(tm.id)::int AS member_count
FROM teams t
LEFT JOIN team_memberships tm ON t.id = tm.team_id
WHERE t.id = $1
GROUP BY t.id;

-- name: CreateTeam :one
INSERT INTO teams (id, name, slug, description)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListTeams :many
SELECT t.*, COUNT(tm.id)::int AS member_count
FROM teams t
LEFT JOIN team_memberships tm ON t.id = tm.team_id
GROUP BY t.id
ORDER BY t.created_at ASC;

-- name: DeleteTeam :exec
DELETE FROM teams WHERE id = $1;

-- name: ListTeamMembers :many
SELECT tm.id, tm.user_id, u.email, tm.role, tm.created_at
FROM team_memberships tm
JOIN users u ON u.id = tm.user_id
WHERE tm.team_id = $1
ORDER BY tm.created_at ASC;

-- name: AddTeamMember :one
INSERT INTO team_memberships (id, user_id, team_id, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: RemoveTeamMember :exec
DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2;

-- name: UpdateTeamMemberRole :exec
UPDATE team_memberships SET role = $1 WHERE team_id = $2 AND user_id = $3;

-- name: GetTeamMemberRole :one
SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2;

-- name: GetUserIDByEmail :one
SELECT id FROM users WHERE email = $1;

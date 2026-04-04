package team

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	db "github.com/sciences44/recif/internal/db/generated"
)

// ErrNotFound is returned when a team is not found.
var ErrNotFound = errors.New("team not found")

// PostgresRepository implements Repository using sqlc-generated queries.
type PostgresRepository struct {
	q *db.Queries
}

// NewPostgresRepository creates a new PostgresRepository.
func NewPostgresRepository(q *db.Queries) *PostgresRepository {
	return &PostgresRepository{q: q}
}

func (r *PostgresRepository) Get(ctx context.Context, id string) (*Team, error) {
	row, err := r.q.GetTeam(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get team %s: %w", id, err)
	}
	return &Team{
		ID:        row.ID,
		Name:      row.Name,
		Slug:      row.Slug,
		Namespace: "team-" + row.Slug,
		CreatedAt: row.CreatedAt.Time,
	}, nil
}

func (r *PostgresRepository) Create(ctx context.Context, id, name, slug string) (*Team, error) {
	row, err := r.q.CreateTeam(ctx, db.CreateTeamParams{
		ID:   id,
		Name: name,
		Slug: slug,
	})
	if err != nil {
		return nil, fmt.Errorf("create team: %w", err)
	}
	return &Team{
		ID:        row.ID,
		Name:      row.Name,
		Slug:      row.Slug,
		Namespace: "team-" + row.Slug,
		CreatedAt: row.CreatedAt.Time,
	}, nil
}

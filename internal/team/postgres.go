package team

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	db "github.com/sciences44/recif/internal/db/generated"
)

var (
	ErrNotFound       = errors.New("team not found")
	ErrMemberNotFound = errors.New("member not found")
	ErrUserNotFound   = errors.New("user not found")
)

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
	return getRowToTeam(row), nil
}

func (r *PostgresRepository) Create(ctx context.Context, id, name, slug, description string) (*Team, error) {
	row, err := r.q.CreateTeam(ctx, db.CreateTeamParams{
		ID:          id,
		Name:        name,
		Slug:        slug,
		Description: description,
	})
	if err != nil {
		return nil, fmt.Errorf("create team: %w", err)
	}
	return createRowToTeam(row), nil
}

func (r *PostgresRepository) List(ctx context.Context) ([]*Team, error) {
	rows, err := r.q.ListTeams(ctx)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	teams := make([]*Team, len(rows))
	for i, row := range rows {
		teams[i] = listRowToTeam(row)
	}
	return teams, nil
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.q.GetTeam(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("delete team %s: %w", id, err)
	}
	return r.q.DeleteTeam(ctx, id)
}

func (r *PostgresRepository) ListMembers(ctx context.Context, teamID string) ([]TeamMember, error) {
	rows, err := r.q.ListTeamMembers(ctx, teamID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	members := make([]TeamMember, len(rows))
	for i, row := range rows {
		members[i] = TeamMember{
			UserID:   row.UserID,
			Email:    row.Email,
			Role:     row.Role,
			JoinedAt: row.CreatedAt.Time,
		}
	}
	return members, nil
}

func (r *PostgresRepository) AddMember(ctx context.Context, membershipID, userID, teamID, role string) error {
	_, err := r.q.AddTeamMember(ctx, db.AddTeamMemberParams{
		ID:     membershipID,
		UserID: userID,
		TeamID: teamID,
		Role:   role,
	})
	return err
}

func (r *PostgresRepository) RemoveMember(ctx context.Context, teamID, userID string) error {
	return r.q.RemoveTeamMember(ctx, db.RemoveTeamMemberParams{
		TeamID: teamID,
		UserID: userID,
	})
}

func (r *PostgresRepository) UpdateMemberRole(ctx context.Context, teamID, userID, role string) error {
	return r.q.UpdateTeamMemberRole(ctx, db.UpdateTeamMemberRoleParams{
		Role:   role,
		TeamID: teamID,
		UserID: userID,
	})
}

func (r *PostgresRepository) GetMemberRole(ctx context.Context, teamID, userID string) (string, error) {
	role, err := r.q.GetTeamMemberRole(ctx, db.GetTeamMemberRoleParams{
		TeamID: teamID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrMemberNotFound
		}
		return "", fmt.Errorf("get member role: %w", err)
	}
	return role, nil
}

func (r *PostgresRepository) GetUserIDByEmail(ctx context.Context, email string) (string, error) {
	id, err := r.q.GetUserIDByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", fmt.Errorf("get user by email: %w", err)
	}
	return id, nil
}

func getRowToTeam(row db.GetTeamRow) *Team {
	return &Team{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Description: row.Description,
		Namespace:   "team-" + row.Slug,
		MemberCount: int(row.MemberCount),
		CreatedAt:   row.CreatedAt.Time,
	}
}

func listRowToTeam(row db.ListTeamsRow) *Team {
	return &Team{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Description: row.Description,
		Namespace:   "team-" + row.Slug,
		MemberCount: int(row.MemberCount),
		CreatedAt:   row.CreatedAt.Time,
	}
}

func createRowToTeam(row db.Team) *Team {
	return &Team{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Description: row.Description,
		Namespace:   "team-" + row.Slug,
		CreatedAt:   row.CreatedAt.Time,
	}
}

package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/sciences44/recif/internal/db/generated"
)

// ErrNotFound is returned when an agent is not found.
var ErrNotFound = errors.New("agent not found")

// PostgresRepository implements Repository using sqlc-generated queries.
type PostgresRepository struct {
	q *db.Queries
}

// NewPostgresRepository creates a new PostgresRepository.
func NewPostgresRepository(q *db.Queries) *PostgresRepository {
	return &PostgresRepository{q: q}
}

func (r *PostgresRepository) Get(ctx context.Context, id string) (*Agent, error) {
	row, err := r.q.GetAgent(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get agent %s: %w", id, err)
	}
	return fromDBAgent(row), nil
}

func (r *PostgresRepository) ListByTeam(ctx context.Context, teamID string, limit, offset int32) ([]Agent, error) {
	rows, err := r.q.ListAgentsByTeam(ctx, db.ListAgentsByTeamParams{
		TeamID: teamID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("list agents for team %s: %w", teamID, err)
	}
	agents := make([]Agent, 0, len(rows))
	for _, row := range rows {
		agents = append(agents, *fromDBAgent(row))
	}
	return agents, nil
}

func (r *PostgresRepository) ListAll(ctx context.Context, limit, offset int32) ([]Agent, error) {
	rows, err := r.q.ListAllAgents(ctx, db.ListAllAgentsParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("list all agents: %w", err)
	}
	agents := make([]Agent, 0, len(rows))
	for _, row := range rows {
		agents = append(agents, *fromDBAgent(row))
	}
	return agents, nil
}

func (r *PostgresRepository) Search(ctx context.Context, query string, limit, offset int32) ([]Agent, error) {
	rows, err := r.q.SearchAgents(ctx, db.SearchAgentsParams{
		Query:  query,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("search agents %q: %w", query, err)
	}
	agents := make([]Agent, 0, len(rows))
	for _, row := range rows {
		agents = append(agents, *fromDBAgent(row))
	}
	return agents, nil
}

func (r *PostgresRepository) Create(ctx context.Context, params CreateParams) (*Agent, error) {
	row, err := r.q.CreateAgent(ctx, db.CreateAgentParams{
		ID:          params.ID,
		TeamID:      params.TeamID,
		Name:        params.Name,
		Slug:        params.Slug,
		Description: pgtype.Text{String: params.Description, Valid: params.Description != ""},
		Status:      string(params.Status),
		Framework:   params.Framework,
		Version:     params.Version,
		Config:      params.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("create agent: %w", err)
	}
	return fromDBAgent(row), nil
}

func (r *PostgresRepository) Update(ctx context.Context, a *Agent) (*Agent, error) {
	row, err := r.q.UpdateAgent(ctx, db.UpdateAgentParams{
		ID:          a.ID,
		Name:        a.Name,
		Slug:        a.Slug,
		Description: pgtype.Text{String: a.Description, Valid: a.Description != ""},
		Status:      string(a.Status),
		Framework:   a.Framework,
		Version:     a.Version,
		Config:      a.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("update agent %s: %w", a.ID, err)
	}
	return fromDBAgent(row), nil
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	if err := r.q.DeleteAgent(ctx, id); err != nil {
		return fmt.Errorf("delete agent %s: %w", id, err)
	}
	return nil
}

func (r *PostgresRepository) GetBySlug(ctx context.Context, teamID, slug string) (*Agent, error) {
	row, err := r.q.GetAgentBySlug(ctx, db.GetAgentBySlugParams{
		TeamID: teamID,
		Slug:   slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get agent by slug %s: %w", slug, err)
	}
	return fromDBAgent(row), nil
}

func (r *PostgresRepository) CreateVersion(ctx context.Context, v AgentVersion) (*AgentVersion, error) {
	row, err := r.q.CreateAgentVersion(ctx, db.CreateAgentVersionParams{
		ID:      v.ID,
		AgentID: v.AgentID,
		Version: v.Version,
		Config:  v.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("create agent version: %w", err)
	}
	return &AgentVersion{
		ID:        row.ID,
		AgentID:   row.AgentID,
		Version:   row.Version,
		Config:    row.Config,
		CreatedAt: row.CreatedAt.Time,
	}, nil
}

func (r *PostgresRepository) ListVersions(ctx context.Context, agentID string) ([]AgentVersion, error) {
	rows, err := r.q.ListVersionsByAgent(ctx, agentID)
	if err != nil {
		return nil, fmt.Errorf("list versions for agent %s: %w", agentID, err)
	}
	versions := make([]AgentVersion, 0, len(rows))
	for _, row := range rows {
		versions = append(versions, AgentVersion{
			ID:        row.ID,
			AgentID:   row.AgentID,
			Version:   row.Version,
			Config:    row.Config,
			CreatedAt: row.CreatedAt.Time,
		})
	}
	return versions, nil
}

func fromDBAgent(row db.Agent) *Agent {
	a := &Agent{
		ID:          row.ID,
		TeamID:      row.TeamID,
		Name:        row.Name,
		Slug:        row.Slug,
		Description: row.Description.String,
		Status:      AgentStatus(row.Status),
		Framework:   row.Framework,
		Version:     row.Version,
		Config:      row.Config,
		CreatedAt:   row.CreatedAt.Time,
		UpdatedAt:   row.UpdatedAt.Time,
	}
	// Extract fields from config JSONB
	var cfg map[string]any
	if len(row.Config) > 0 {
		if err := json.Unmarshal(row.Config, &cfg); err == nil {
			if v, ok := cfg["model_type"].(string); ok {
				a.ModelType = v
			}
			if v, ok := cfg["model_id"].(string); ok {
				a.ModelID = v
			}
			if v, ok := cfg["skills"].([]any); ok {
				for _, s := range v {
					if str, ok := s.(string); ok {
						a.Skills = append(a.Skills, str)
					}
				}
			}
			if v, ok := cfg["tools"].([]any); ok {
				for _, t := range v {
					if str, ok := t.(string); ok {
						a.Tools = append(a.Tools, str)
					}
				}
			}
		}
	}
	return a
}

// UpdateConfig merges new key-value pairs into the agent's Config JSONB and persists to DB.
func (r *PostgresRepository) UpdateConfig(ctx context.Context, id string, updates map[string]any) error {
	// Read current config
	agent, err := r.q.GetAgent(ctx, id)
	if err != nil {
		return fmt.Errorf("get agent for config update: %w", err)
	}

	var cfg map[string]any
	if len(agent.Config) > 0 {
		if err := json.Unmarshal(agent.Config, &cfg); err != nil {
			cfg = make(map[string]any)
		}
	} else {
		cfg = make(map[string]any)
	}

	// Merge updates
	for k, v := range updates {
		cfg[k] = v
	}

	newConfig, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	// Update the agent with new config
	_, err = r.q.UpdateAgent(ctx, db.UpdateAgentParams{
		ID:          id,
		Name:        agent.Name,
		Slug:        agent.Slug,
		Description: agent.Description,
		Status:      agent.Status,
		Framework:   agent.Framework,
		Version:     agent.Version,
		Config:      newConfig,
	})
	if err != nil {
		return fmt.Errorf("update agent config: %w", err)
	}

	return nil
}

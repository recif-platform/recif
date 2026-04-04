package agent

import "context"

// Repository defines the interface for agent data access.
type Repository interface {
	Get(ctx context.Context, id string) (*Agent, error)
	GetBySlug(ctx context.Context, teamID, slug string) (*Agent, error)
	ListByTeam(ctx context.Context, teamID string, limit, offset int32) ([]Agent, error)
	ListAll(ctx context.Context, limit, offset int32) ([]Agent, error)
	Search(ctx context.Context, query string, limit, offset int32) ([]Agent, error)
	Create(ctx context.Context, params CreateParams) (*Agent, error)
	Update(ctx context.Context, a *Agent) (*Agent, error)
	Delete(ctx context.Context, id string) error
	UpdateConfig(ctx context.Context, id string, updates map[string]any) error
	CreateVersion(ctx context.Context, v AgentVersion) (*AgentVersion, error)
	ListVersions(ctx context.Context, agentID string) ([]AgentVersion, error)
}

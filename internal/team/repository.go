package team

import "context"

// Repository defines the interface for team data access.
type Repository interface {
	Get(ctx context.Context, id string) (*Team, error)
	Create(ctx context.Context, id, name, slug string) (*Team, error)
}

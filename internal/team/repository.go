package team

import "context"

// Repository defines the interface for team data access.
type Repository interface {
	Get(ctx context.Context, id string) (*Team, error)
	Create(ctx context.Context, id, name, slug, description string) (*Team, error)
	List(ctx context.Context) ([]*Team, error)
	Delete(ctx context.Context, id string) error

	ListMembers(ctx context.Context, teamID string) ([]TeamMember, error)
	AddMember(ctx context.Context, membershipID, userID, teamID, role string) error
	RemoveMember(ctx context.Context, teamID, userID string) error
	UpdateMemberRole(ctx context.Context, teamID, userID, role string) error
	GetMemberRole(ctx context.Context, teamID, userID string) (string, error)
	GetUserIDByEmail(ctx context.Context, email string) (string, error)
}

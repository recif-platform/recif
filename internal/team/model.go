package team

import "time"

// Team represents a workspace/organization in the platform.
type Team struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	Namespace   string    `json:"namespace"`
	MemberCount int       `json:"member_count"`
	AgentCount  int       `json:"agent_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// TeamMember represents a user's membership in a team.
type TeamMember struct {
	UserID   string    `json:"user_id"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// CreateTeamRequest is the payload for creating a new team.
type CreateTeamRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// AddMemberRequest is the payload for adding a member to a team.
type AddMemberRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// UpdateMemberRoleRequest is the payload for changing a member's role.
type UpdateMemberRoleRequest struct {
	Role string `json:"role"`
}

package agent

import "time"

// AgentStatus represents the lifecycle state of an agent.
type AgentStatus string

const (
	StatusRegistered AgentStatus = "registered"
	StatusDraft      AgentStatus = "draft"
	StatusActive     AgentStatus = "active"
	StatusArchived   AgentStatus = "archived"
)

// Agent represents an AI agent in the platform.
type Agent struct {
	ID          string      `json:"id"`
	TeamID      string      `json:"team_id"`
	CreatedBy   string      `json:"created_by,omitempty"`
	PromptRef   string      `json:"prompt_ref,omitempty"`
	Name        string      `json:"name"`
	Slug        string      `json:"slug"`
	Description string      `json:"description,omitempty"`
	Status      AgentStatus `json:"status"`
	Framework   string      `json:"framework"`
	Version     string      `json:"version"`
	Config      []byte      `json:"config"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`

	// K8s CRD fields — enriched at API layer, not stored in DB
	Channel   string   `json:"channel,omitempty"`
	Strategy  string   `json:"strategy,omitempty"`
	ModelType string   `json:"model_type,omitempty"`
	ModelID   string   `json:"model_id,omitempty"`
	SystemPrompt string `json:"system_prompt,omitempty"`
	Storage      string `json:"storage,omitempty"`
	Image        string `json:"image,omitempty"`
	Replicas  int32    `json:"replicas,omitempty"`
	Endpoint  string   `json:"endpoint,omitempty"`
	Phase     string   `json:"phase,omitempty"`
	Tools          []string    `json:"tools,omitempty"`
	KnowledgeBases []string    `json:"knowledgeBases,omitempty"`
	Skills         []string    `json:"skills,omitempty"`
	Canary         *CanaryInfo `json:"canary,omitempty"`
}

// CanaryInfo holds the canary deployment state extracted from the Agent CRD.
type CanaryInfo struct {
	Enabled      bool           `json:"enabled"`
	Weight       int            `json:"weight"`
	Version      string         `json:"version,omitempty"`
	ModelType    string         `json:"model_type,omitempty"`
	ModelID      string         `json:"model_id,omitempty"`
	SystemPrompt string         `json:"system_prompt,omitempty"`
	Config       map[string]any `json:"config,omitempty"`
}

// CreateParams holds the parameters for creating an agent.
type CreateParams struct {
	ID          string
	TeamID      string
	CreatedBy   string
	PromptRef   string
	Name        string
	Slug        string
	Description string
	Status      AgentStatus
	Framework   string
	Version     string
	Config      []byte
}

// AgentVersion represents a versioned snapshot of an agent configuration.
type AgentVersion struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agent_id"`
	Version   string    `json:"version"`
	Config    []byte    `json:"config"`
	CreatedAt time.Time `json:"created_at"`
}

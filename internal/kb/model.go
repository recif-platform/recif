package kb

import "time"

// KnowledgeBase represents a knowledge base with its document and chunk statistics.
type KnowledgeBase struct {
	ID             string           `json:"id"`
	TeamID         string           `json:"team_id"`
	Name           string           `json:"name"`
	Slug           string           `json:"slug"`
	Description    string           `json:"description"`
	EmbeddingModel string           `json:"embedding_model"`
	EmbeddingDim   int              `json:"embedding_dim"`
	ChunkSize      int              `json:"chunk_size"`
	ChunkOverlap   int              `json:"chunk_overlap"`
	DocCount       int              `json:"doc_count"`
	ChunkCount     int              `json:"chunk_count"`
	Status         string           `json:"status"`
	Connector      *ConnectorConfig `json:"connector,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}

// Document represents a document ingested into a knowledge base.
type Document struct {
	ID          string    `json:"id"`
	KBID        string    `json:"kb_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	Status      string    `json:"status"`
	PageCount   int       `json:"page_count"`
	ChunkCount  int       `json:"chunk_count"`
	Error       string    `json:"error,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// SearchResult represents a single chunk returned from a similarity search.
type SearchResult struct {
	ChunkID    string  `json:"chunk_id"`
	Content    string  `json:"content"`
	Score      float64 `json:"score"`
	ChunkIndex int     `json:"chunk_index"`
	DocumentID string  `json:"document_id"`
	Filename   string  `json:"filename"`
}

// ConnectorConfig holds the configuration for an external data source connector.
type ConnectorConfig struct {
	Type        string            `json:"type"`         // google_drive, jira, confluence, databricks
	Path        string            `json:"path"`         // folder ID, project key, space key, table path
	Credentials map[string]string `json:"credentials"`  // auth credentials (stored encrypted)
	Schedule    string            `json:"schedule"`      // cron expression for sync (e.g., "0 */6 * * *")
	LastSyncAt  *time.Time        `json:"last_sync_at,omitempty"`
	Status      string            `json:"status"`        // idle, syncing, error
}

// CreateParams holds the parameters for creating a new knowledge base.
type CreateParams struct {
	Name           string           `json:"name" validate:"required,min=1,max=255"`
	Description    string           `json:"description" validate:"max=1000"`
	EmbeddingModel string           `json:"embedding_model"`
	ChunkSize      int              `json:"chunk_size"`
	ChunkOverlap   int              `json:"chunk_overlap"`
	Connector      *ConnectorConfig `json:"connector,omitempty"`
}

// SearchParams holds the parameters for a similarity search.
type SearchParams struct {
	Query string `json:"query" validate:"required,min=1"`
	TopK  int    `json:"top_k"`
}

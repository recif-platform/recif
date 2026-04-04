package audit

import (
	"context"
	"log/slog"
	"time"

	"github.com/oklog/ulid/v2"
)

// Event represents an audit trail entry.
type Event struct {
	ID           string         `json:"id"`
	ActorID      string         `json:"actor_id"`
	Action       string         `json:"action"`
	ResourceType string         `json:"resource_type"`
	ResourceID   string         `json:"resource_id,omitempty"`
	Outcome      string         `json:"outcome"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    time.Time      `json:"created_at"`
}

// Writer writes audit events.
type Writer interface {
	Write(ctx context.Context, event Event) error
}

// LogWriter writes audit events to slog (fallback when no DB).
type LogWriter struct {
	logger *slog.Logger
}

// NewLogWriter creates a log-based audit writer.
func NewLogWriter(logger *slog.Logger) *LogWriter {
	return &LogWriter{logger: logger}
}

func (w *LogWriter) Write(_ context.Context, event Event) error {
	w.logger.Info("audit_event",
		"event_id", event.ID,
		"actor", event.ActorID,
		"action", event.Action,
		"resource_type", event.ResourceType,
		"resource_id", event.ResourceID,
		"outcome", event.Outcome,
	)
	return nil
}

// NewEventID generates a type-prefixed audit event ID.
func NewEventID() string {
	return "ae_" + ulid.Make().String()
}

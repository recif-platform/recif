package eventbus

import (
	"context"
	"log/slog"
	"sync"
)

// Event type constants for platform-wide events.
const (
	AgentCreated       = "agent.created"
	AgentDeployed      = "agent.deployed"
	AgentStopped       = "agent.stopped"
	AgentRestarted     = "agent.restarted"
	AgentConfigChanged = "agent.config_changed"
	AgentDeleted       = "agent.deleted"
	ReleaseCreated     = "release.created"
	ReleaseDeployed    = "release.deployed"

	AgentCanaryStarted    = "agent.canary_started"
	AgentCanaryPromoted   = "agent.canary_promoted"
	AgentCanaryRolledBack = "agent.canary_rolled_back"

	// Evaluation lifecycle
	EvalRequested   = "eval.requested"
	EvalCompleted   = "eval.completed"
	EvalFailed      = "eval.failed"
	ReleaseApproved = "release.approved"
	ReleaseRejected = "release.rejected"
)

// Event represents a platform event.
type Event struct {
	Type    string
	Payload map[string]any
}

// Handler is a function that processes an event.
type Handler func(ctx context.Context, event Event)

// EventBus is a simple synchronous pub/sub for internal events.
type EventBus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
	logger   *slog.Logger
}

// New creates a new EventBus.
func New(logger *slog.Logger) *EventBus {
	return &EventBus{
		handlers: make(map[string][]Handler),
		logger:   logger,
	}
}

// Subscribe registers a handler for an event type. Use "*" for all events.
func (b *EventBus) Subscribe(eventType string, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventType] = append(b.handlers[eventType], handler)
}

// Emit publishes an event to all matching subscribers.
func (b *EventBus) Emit(ctx context.Context, event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	b.logger.Debug("event emitted", "type", event.Type)

	// Deliver to type-specific handlers.
	for _, h := range b.handlers[event.Type] {
		h(ctx, event)
	}

	// Deliver to wildcard handlers.
	if event.Type != "*" {
		for _, h := range b.handlers["*"] {
			h(ctx, event)
		}
	}
}

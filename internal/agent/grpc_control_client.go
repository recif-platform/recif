package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	controlv1 "github.com/sciences44/recif/gen/control/v1"
)

// GrpcControlClient communicates with Corail's control plane over gRPC.
// This is the gRPC replacement for the HTTP ControlClient.
type GrpcControlClient struct {
	conn   *grpc.ClientConn
	client controlv1.ControlServiceClient
	logger *slog.Logger
}

// NewGrpcControlClient creates a gRPC client that talks to one Corail agent pod.
// target is e.g. "my-agent.team-default.svc.cluster.local:9001".
func NewGrpcControlClient(target string, logger *slog.Logger) (*GrpcControlClient, error) {
	conn, err := grpc.NewClient(target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", target, err)
	}
	return &GrpcControlClient{
		conn:   conn,
		client: controlv1.NewControlServiceClient(conn),
		logger: logger,
	}, nil
}

// Close closes the gRPC connection.
func (c *GrpcControlClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// GetStatus calls the GetStatus RPC.
func (c *GrpcControlClient) GetStatus(ctx context.Context) (*AgentStatusResponse, error) {
	resp, err := c.client.GetStatus(ctx, &controlv1.GetStatusRequest{})
	if err != nil {
		return nil, fmt.Errorf("grpc GetStatus: %w", err)
	}
	return &AgentStatusResponse{
		AgentID:          resp.AgentId,
		Phase:            resp.Phase,
		ActiveSessions:   int(resp.ActiveSessions),
		ToolsCount:       int(resp.ToolsCount),
		KBsCount:         int(resp.KbsCount),
		EventSubscribers: int(resp.EventSubscribers),
		EventHistorySize: int(resp.EventHistorySize),
	}, nil
}

// UpdateConfig calls the UpdateConfig RPC.
func (c *GrpcControlClient) UpdateConfig(ctx context.Context, config map[string]string) (*AckResponse, error) {
	resp, err := c.client.UpdateConfig(ctx, &controlv1.UpdateConfigRequest{
		Config: config,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc UpdateConfig: %w", err)
	}
	return &AckResponse{
		Success: resp.Success,
		Message: resp.Message,
	}, nil
}

// ReloadTools calls the Reload RPC with target=tools.
func (c *GrpcControlClient) ReloadTools(ctx context.Context, reason string) (*AckResponse, error) {
	resp, err := c.client.Reload(ctx, &controlv1.ReloadRequest{
		Target: "tools",
		Reason: reason,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc Reload(tools): %w", err)
	}
	return &AckResponse{
		Success: resp.Success,
		Message: resp.Message,
	}, nil
}

// ReloadKnowledgeBases calls the Reload RPC with target=knowledge_bases.
func (c *GrpcControlClient) ReloadKnowledgeBases(ctx context.Context, reason string) (*AckResponse, error) {
	resp, err := c.client.Reload(ctx, &controlv1.ReloadRequest{
		Target: "knowledge_bases",
		Reason: reason,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc Reload(knowledge_bases): %w", err)
	}
	return &AckResponse{
		Success: resp.Success,
		Message: resp.Message,
	}, nil
}

// Pause calls the Pause RPC.
func (c *GrpcControlClient) Pause(ctx context.Context) (*AckResponse, error) {
	resp, err := c.client.Pause(ctx, &controlv1.PauseRequest{})
	if err != nil {
		return nil, fmt.Errorf("grpc Pause: %w", err)
	}
	return &AckResponse{
		Success: resp.Success,
		Message: resp.Message,
	}, nil
}

// Resume calls the Resume RPC.
func (c *GrpcControlClient) Resume(ctx context.Context) (*AckResponse, error) {
	resp, err := c.client.Resume(ctx, &controlv1.ResumeRequest{})
	if err != nil {
		return nil, fmt.Errorf("grpc Resume: %w", err)
	}
	return &AckResponse{
		Success: resp.Success,
		Message: resp.Message,
	}, nil
}

// SubscribeEvents connects to the StreamEvents RPC and delivers events
// to the provided channel.  Blocks until the context is canceled or the
// stream drops.
func (c *GrpcControlClient) SubscribeEvents(ctx context.Context, out chan<- AgentEventData) error {
	stream, err := c.client.StreamEvents(ctx, &controlv1.StreamEventsRequest{})
	if err != nil {
		return fmt.Errorf("grpc StreamEvents: %w", err)
	}

	c.logger.Info("gRPC event stream connected")

	for {
		event, err := stream.Recv()
		if err != nil {
			return fmt.Errorf("grpc StreamEvents recv: %w", err)
		}

		var data map[string]interface{}
		if event.DataJson != "" {
			_ = json.Unmarshal([]byte(event.DataJson), &data) //nolint:errcheck // best effort
		}

		agentEvent := AgentEventData{
			Type:      event.Type,
			Timestamp: event.Timestamp,
			Data:      data,
		}

		select {
		case out <- agentEvent:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

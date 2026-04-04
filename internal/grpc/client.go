package grpc

import (
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

// Client manages the gRPC connection to Corail.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient creates a gRPC client connection to the given address.
// If tlsCfg is nil, uses insecure credentials (dev mode).
func NewClient(addr string, tlsCfg *TLSConfig) (*Client, error) {
	var opts []grpc.DialOption

	if tlsCfg != nil && tlsCfg.Config != nil {
		opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(tlsCfg.Config)))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(addr, opts...)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", addr, err)
	}

	return &Client{conn: conn}, nil
}

// Conn returns the underlying gRPC connection for creating service clients.
func (c *Client) Conn() *grpc.ClientConn {
	return c.conn
}

// Close closes the gRPC connection.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

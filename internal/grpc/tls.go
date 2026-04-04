package grpc

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// TLSConfig wraps a tls.Config for gRPC mTLS.
type TLSConfig struct {
	Config *tls.Config
}

// LoadTLSConfig loads mTLS certificates from filesystem.
func LoadTLSConfig(certPath, keyPath, caPath string) (*TLSConfig, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("load key pair: %w", err)
	}

	caCert, err := os.ReadFile(caPath) //nolint:gosec // CA path from trusted config
	if err != nil {
		return nil, fmt.Errorf("read CA cert: %w", err)
	}

	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}

	return &TLSConfig{
		Config: &tls.Config{
			Certificates: []tls.Certificate{cert},
			RootCAs:      caPool,
			MinVersion:   tls.VersionTLS13,
		},
	}, nil
}

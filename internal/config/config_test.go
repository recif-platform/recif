package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear any env vars that could leak from the host.
	envVars := []string{
		"RECIF_PORT", "DATABASE_URL", "CORAIL_GRPC_ADDR",
		"AUTH_ENABLED", "JWT_SECRET", "LOG_LEVEL", "LOG_FORMAT",
		"MTLS_CERT_PATH", "MTLS_KEY_PATH", "MTLS_CA_PATH", "AGENT_BASE_URL",
		"AGENT_GRPC_URL",
	}
	for _, key := range envVars {
		t.Setenv(key, "")
		_ = os.Unsetenv(key)
	}

	cfg := Load()

	checks := []struct {
		name string
		got  string
		want string
	}{
		{"Port", cfg.Port, "8080"},
		{"DatabaseURL", cfg.DatabaseURL, "postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable"},
		{"CorailGRPCAddr", cfg.CorailGRPCAddr, "localhost:50051"},
		{"JWTSecret", cfg.JWTSecret, "dev-secret-change-in-production"},
		{"LogLevel", cfg.LogLevel, "info"},
		{"LogFormat", cfg.LogFormat, "text"},
		{"MTLSCertPath", cfg.MTLSCertPath, ""},
		{"MTLSKeyPath", cfg.MTLSKeyPath, ""},
		{"MTLSCAPath", cfg.MTLSCAPath, ""},
		{"AgentBaseURL", cfg.AgentBaseURL, "http://%s.team-default.svc.cluster.local:8000"},
		{"AgentGRPCURL", cfg.AgentGRPCURL, ""},
	}

	for _, tc := range checks {
		t.Run(tc.name, func(t *testing.T) {
			if tc.got != tc.want {
				t.Errorf("%s = %q, want %q", tc.name, tc.got, tc.want)
			}
		})
	}

	if cfg.AuthEnabled {
		t.Error("AuthEnabled should be false by default")
	}
}

func TestLoad_EnvOverrides(t *testing.T) {
	t.Setenv("RECIF_PORT", "3000")
	t.Setenv("DATABASE_URL", "postgres://custom:5432/mydb")
	t.Setenv("CORAIL_GRPC_ADDR", "grpc.example.com:443")
	t.Setenv("AUTH_ENABLED", "true")
	t.Setenv("JWT_SECRET", "super-secret")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("LOG_FORMAT", "json")
	t.Setenv("MTLS_CERT_PATH", "/certs/tls.crt")
	t.Setenv("MTLS_KEY_PATH", "/certs/tls.key")
	t.Setenv("MTLS_CA_PATH", "/certs/ca.crt")
	t.Setenv("AGENT_BASE_URL", "http://agents.internal:8080")

	cfg := Load()

	if cfg.Port != "3000" {
		t.Errorf("Port = %q, want 3000", cfg.Port)
	}
	if cfg.DatabaseURL != "postgres://custom:5432/mydb" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.CorailGRPCAddr != "grpc.example.com:443" {
		t.Errorf("CorailGRPCAddr = %q", cfg.CorailGRPCAddr)
	}
	if !cfg.AuthEnabled {
		t.Error("AuthEnabled should be true")
	}
	if cfg.JWTSecret != "super-secret" {
		t.Errorf("JWTSecret = %q", cfg.JWTSecret)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q", cfg.LogLevel)
	}
	if cfg.LogFormat != "json" {
		t.Errorf("LogFormat = %q", cfg.LogFormat)
	}
	if cfg.MTLSCertPath != "/certs/tls.crt" {
		t.Errorf("MTLSCertPath = %q", cfg.MTLSCertPath)
	}
	if cfg.MTLSKeyPath != "/certs/tls.key" {
		t.Errorf("MTLSKeyPath = %q", cfg.MTLSKeyPath)
	}
	if cfg.MTLSCAPath != "/certs/ca.crt" {
		t.Errorf("MTLSCAPath = %q", cfg.MTLSCAPath)
	}
	if cfg.AgentBaseURL != "http://agents.internal:8080" {
		t.Errorf("AgentBaseURL = %q", cfg.AgentBaseURL)
	}
}

func TestLoad_AuthEnabled_FalseByDefault(t *testing.T) {
	t.Setenv("AUTH_ENABLED", "")
	_ = os.Unsetenv("AUTH_ENABLED")

	cfg := Load()
	if cfg.AuthEnabled {
		t.Error("AuthEnabled should be false when AUTH_ENABLED is unset")
	}
}

func TestLoad_AuthEnabled_OnlyTrueIsTrue(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{"true", true},
		{"false", false},
		{"TRUE", false},  // getEnv returns exact string; only "true" matches
		{"1", false},
		{"yes", false},
	}
	for _, tc := range cases {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("AUTH_ENABLED", tc.value)
			cfg := Load()
			if cfg.AuthEnabled != tc.want {
				t.Errorf("AUTH_ENABLED=%q: AuthEnabled = %v, want %v", tc.value, cfg.AuthEnabled, tc.want)
			}
		})
	}
}

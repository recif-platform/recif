package config

import (
	"net/url"
	"os"
	"strings"
)

// Config holds application configuration loaded from environment variables.
type Config struct {
	Port           string
	DatabaseURL    string
	KBDatabaseURL  string // Connection to corail_storage for knowledge base operations
	CorailGRPCAddr string
	AuthEnabled    bool
	JWTSecret      string
	LogLevel       string
	LogFormat      string
	MTLSCertPath   string
	MTLSKeyPath    string
	MTLSCAPath     string
	AgentBaseURL   string // Template URL for agent HTTP proxy. %s = agent slug
	AgentGRPCURL   string // Template URL for agent gRPC proxy. %s = agent slug, port 9001
	StateRepo      string // GitHub repo for recif-state (e.g. "sciences44/recif-state")
	StateBranch    string // Branch in the state repo (default: main)
	StateToken     string // GitHub token for commits to the state repo
	MLflowURI      string // MLflow tracking server URI for prompt registry and tracing
	AdminEmail     string // Bootstrap admin user email (used on first startup when no users exist)
	AdminPassword  string // Bootstrap admin user password
	AdminName      string // Bootstrap admin user display name
}

// Load reads configuration from environment variables with sensible defaults.
func Load() Config {
	dbURL := getEnv("DATABASE_URL", "postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable")
	return Config{
		Port:           getEnv("RECIF_PORT", "8080"),
		DatabaseURL:    dbURL,
		KBDatabaseURL:  getEnv("KB_DATABASE_URL", deriveKBDatabaseURL(dbURL)),
		CorailGRPCAddr: getEnv("CORAIL_GRPC_ADDR", "localhost:50051"),
		AuthEnabled:    getEnv("AUTH_ENABLED", "false") == "true",
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
		LogFormat:      getEnv("LOG_FORMAT", "text"),
		MTLSCertPath:   getEnv("MTLS_CERT_PATH", ""),
		MTLSKeyPath:    getEnv("MTLS_KEY_PATH", ""),
		MTLSCAPath:     getEnv("MTLS_CA_PATH", ""),
		AgentBaseURL:   getEnv("AGENT_BASE_URL", "http://%s.team-default.svc.cluster.local:8000"),
		AgentGRPCURL:   os.Getenv("AGENT_GRPC_URL"), // empty = use HTTP proxy, no default
		StateRepo:      getEnv("RECIF_STATE_REPO", "sciences44/recif-state"),
		StateBranch:    getEnv("RECIF_STATE_BRANCH", "main"),
		StateToken:     os.Getenv("RECIF_STATE_TOKEN"),
		MLflowURI:      getEnv("MLFLOW_TRACKING_URI", "http://mlflow.mlflow-system.svc.cluster.local:5000"),
		AdminEmail:     os.Getenv("ADMIN_EMAIL"),
		AdminPassword:  os.Getenv("ADMIN_PASSWORD"),
		AdminName:      getEnv("ADMIN_NAME", "Admin"),
	}
}

// deriveKBDatabaseURL replaces the database name in a PostgreSQL DSN with "corail_storage".
func deriveKBDatabaseURL(mainDSN string) string {
	u, err := url.Parse(mainDSN)
	if err != nil {
		// Fallback: simple string replacement
		return strings.Replace(mainDSN, "/recif", "/corail_storage", 1)
	}
	u.Path = "/corail_storage"
	return u.String()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

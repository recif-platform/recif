package gitstate

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/sciences44/recif/internal/agent"
	"gopkg.in/yaml.v3"
)

// AgentArtifact is the immutable release artifact committed to recif-state.
type AgentArtifact struct {
	APIVersion string           `yaml:"apiVersion" json:"apiVersion"`
	Kind       string           `yaml:"kind" json:"kind"`
	Metadata   ArtifactMetadata `yaml:"metadata" json:"metadata"`
	Runtime    RuntimeConfig    `yaml:"runtime" json:"runtime"`
	Agent      AgentConfig      `yaml:"agent" json:"agent"`
	Governance GovernanceConfig `yaml:"governance" json:"governance"`
	Deployment DeploymentConfig `yaml:"deployment" json:"deployment"`
}

// ArtifactMetadata holds release versioning and audit information.
type ArtifactMetadata struct {
	Name      string `yaml:"name" json:"name"`
	AgentID   string `yaml:"agent_id,omitempty" json:"agent_id,omitempty"`
	TeamID    string `yaml:"team_id,omitempty" json:"team_id,omitempty"`
	Version   int    `yaml:"version" json:"version"`
	Previous  int    `yaml:"previous" json:"previous"`
	Author    string `yaml:"author" json:"author"`
	Timestamp string `yaml:"timestamp" json:"timestamp"`
	Changelog string `yaml:"changelog" json:"changelog"`
	Checksum  string `yaml:"checksum" json:"checksum"`
	Status    string `yaml:"status" json:"status"` // pending_eval, active, rejected, archived
}

// RuntimeConfig describes the container runtime for the agent.
type RuntimeConfig struct {
	Image     string                       `yaml:"image" json:"image"`
	Channel   string                       `yaml:"channel" json:"channel"`
	Strategy  string                       `yaml:"strategy" json:"strategy"`
	Replicas  int                          `yaml:"replicas" json:"replicas"`
	Resources map[string]map[string]string `yaml:"resources,omitempty" json:"resources,omitempty"`
}

// AgentConfig holds the AI/LLM configuration for the agent.
type AgentConfig struct {
	Model          ModelConfig  `yaml:"model" json:"model"`
	SystemPrompt   string       `yaml:"system_prompt" json:"system_prompt"`
	PromptRef      string       `yaml:"prompt_ref,omitempty" json:"prompt_ref,omitempty"`
	Skills         []string     `yaml:"skills" json:"skills"`
	Tools          []string     `yaml:"tools" json:"tools"`
	KnowledgeBases []string    `yaml:"knowledge_bases" json:"knowledge_bases"`
	Memory         MemoryConfig `yaml:"memory" json:"memory"`
}

// ModelConfig identifies the LLM provider and model.
type ModelConfig struct {
	Provider string `yaml:"provider" json:"provider"`
	ID       string `yaml:"id" json:"id"`
}

// MemoryConfig describes the agent memory backend.
type MemoryConfig struct {
	Backend string `yaml:"backend" json:"backend"`
}

// GovernanceConfig holds guardrails and policy references.
type GovernanceConfig struct {
	Guards          []string `yaml:"guards" json:"guards"`
	RiskProfile     string   `yaml:"risk_profile" json:"risk_profile"`
	Policies        []string `yaml:"policies" json:"policies"`
	EvalDataset     string   `yaml:"eval_dataset" json:"eval_dataset"`
	MinQualityScore int      `yaml:"min_quality_score" json:"min_quality_score"`
}

// DeploymentConfig holds the target namespace and environment.
type DeploymentConfig struct {
	Namespace   string `yaml:"namespace" json:"namespace"`
	Environment string `yaml:"environment" json:"environment"`
}

// BuildArtifact constructs an AgentArtifact from an agent's current config.
// The namespace is derived from the agent's team; defaults to "team-default".
func BuildArtifact(agentSlug string, version int, changelog string, a *agent.Agent) *AgentArtifact {
	// Parse config JSONB for fields not directly on the Agent struct
	cfg := map[string]interface{}{}
	if len(a.Config) > 0 {
		_ = json.Unmarshal(a.Config, &cfg)
	}

	systemPrompt := a.SystemPrompt
	if systemPrompt == "" {
		systemPrompt, _ = cfg["system_prompt"].(string)
	}
	storage, _ := cfg["storage"].(string)
	if storage == "" {
		storage = a.Storage
	}
	if storage == "" {
		storage = "memory"
	}

	skills := a.Skills
	if skills == nil {
		skills = extractStringSlice(cfg, "skills")
	}

	tools := a.Tools
	if tools == nil {
		tools = extractStringSlice(cfg, "tools")
	}

	kbs := a.KnowledgeBases
	if kbs == nil {
		kbs = extractStringSlice(cfg, "knowledge_bases")
	}

	previous := version - 1
	if previous < 0 {
		previous = 0
	}

	// Read governance from agent config JSONB (if set by dashboard/API)
	govCfg, _ := cfg["governance"].(map[string]interface{})
	riskProfile := extractString(govCfg, "risk_profile", "standard")
	evalDataset := extractString(govCfg, "eval_dataset", "")
	minQualityScore := extractInt(govCfg, "min_quality_score", 0)
	guards := extractStringSlice(govCfg, "guards")
	policies := extractStringSlice(govCfg, "policies")
	if len(policies) == 0 {
		policies = []string{"default"}
	}

	return &AgentArtifact{
		APIVersion: "agents.recif.dev/v1",
		Kind:       "AgentRelease",
		Metadata: ArtifactMetadata{
			Name:      agentSlug,
			AgentID:   a.ID,
			TeamID:    a.TeamID,
			Version:   version,
			Previous:  previous,
			Author:    "recif-api",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Changelog: changelog,
			Status:    "pending_eval",
		},
		Runtime: RuntimeConfig{
			Image:    coalesce(a.Image, "ghcr.io/recif-platform/corail:latest"),
			Channel:  coalesce(a.Channel, "rest"),
			Strategy: coalesce(a.Strategy, "agent-react"),
			Replicas: maxInt(int(a.Replicas), 1),
		},
		Agent: AgentConfig{
			Model: ModelConfig{
				Provider: coalesce(a.ModelType, "ollama"),
				ID:       coalesce(a.ModelID, ""),
			},
			SystemPrompt:   systemPrompt,
			PromptRef:      a.PromptRef,
			Skills:         orEmpty(skills),
			Tools:          orEmpty(tools),
			KnowledgeBases: orEmpty(kbs),
			Memory: MemoryConfig{
				Backend: storage,
			},
		},
		Governance: GovernanceConfig{
			Guards:          orEmpty(guards),
			RiskProfile:     riskProfile,
			Policies:        policies,
			EvalDataset:     evalDataset,
			MinQualityScore: minQualityScore,
		},
		Deployment: DeploymentConfig{
			Namespace:   DeriveNamespace(a.TeamID),
			Environment: "development",
		},
	}
}

// ComputeChecksum returns a SHA-256 hex digest of the artifact's YAML serialization.
// The checksum field itself is zeroed before hashing to avoid circularity.
func (a *AgentArtifact) ComputeChecksum() string {
	copy := *a
	copy.Metadata.Checksum = ""
	data, err := yaml.Marshal(&copy)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}

// MarshalYAML returns the YAML-encoded artifact.
func (a *AgentArtifact) MarshalYAML() ([]byte, error) {
	return yaml.Marshal(a)
}

// UnmarshalArtifact parses a YAML string into an AgentArtifact.
func UnmarshalArtifact(data string) (*AgentArtifact, error) {
	var a AgentArtifact
	if err := yaml.Unmarshal([]byte(data), &a); err != nil {
		return nil, fmt.Errorf("unmarshal artifact: %w", err)
	}
	return &a, nil
}

// --- helpers ---

func extractStringSlice(cfg map[string]interface{}, key string) []string {
	raw, ok := cfg[key]
	if !ok {
		return nil
	}
	list, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, v := range list {
		out = append(out, fmt.Sprintf("%v", v))
	}
	return out
}

func extractString(cfg map[string]interface{}, key, fallback string) string {
	if cfg == nil {
		return fallback
	}
	v, ok := cfg[key].(string)
	if !ok || v == "" {
		return fallback
	}
	return v
}

func extractInt(cfg map[string]interface{}, key string, fallback int) int {
	if cfg == nil {
		return fallback
	}
	switch v := cfg[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return fallback
	}
}

func coalesce(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func orEmpty(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// ArtifactToManifest converts an AgentArtifact to a valid K8s Agent CRD YAML manifest.
// This produces the manifest ArgoCD applies to the cluster.
func ArtifactToManifest(artifact *AgentArtifact) (string, error) {
	namespace := artifact.Deployment.Namespace
	if namespace == "" {
		namespace = "team-default"
	}

	replicas := int64(maxInt(artifact.Runtime.Replicas, 1))

	spec := map[string]interface{}{
		"name":      artifact.Metadata.Name,
		"framework": "corail",
		"modelType": artifact.Agent.Model.Provider,
		"modelId":   artifact.Agent.Model.ID,
		"strategy":  artifact.Runtime.Strategy,
		"channel":   artifact.Runtime.Channel,
		"image":     artifact.Runtime.Image,
		"replicas":  replicas,
	}

	if artifact.Agent.SystemPrompt != "" {
		spec["systemPrompt"] = artifact.Agent.SystemPrompt
	}
	if artifact.Agent.Memory.Backend != "" {
		spec["storage"] = artifact.Agent.Memory.Backend
	}
	if len(artifact.Agent.Tools) > 0 {
		spec["tools"] = artifact.Agent.Tools
	}
	if len(artifact.Agent.Skills) > 0 {
		spec["skills"] = artifact.Agent.Skills
	}
	if len(artifact.Agent.KnowledgeBases) > 0 {
		spec["knowledgeBases"] = artifact.Agent.KnowledgeBases
	}

	manifest := map[string]interface{}{
		"apiVersion": "agents.recif.dev/v1",
		"kind":       "Agent",
		"metadata": map[string]interface{}{
			"name":      artifact.Metadata.Name,
			"namespace": namespace,
			"annotations": map[string]interface{}{
				"recif.dev/agent-id":         artifact.Metadata.AgentID,
				"recif.dev/team-id":          artifact.Metadata.TeamID,
				"recif.dev/release-version":  fmt.Sprintf("%d", artifact.Metadata.Version),
				"recif.dev/release-checksum": artifact.Metadata.Checksum,
			},
		},
		"spec": spec,
	}

	data, err := yaml.Marshal(manifest)
	if err != nil {
		return "", fmt.Errorf("marshal manifest: %w", err)
	}
	return string(data), nil
}

// AgentDir returns the state repo directory for an agent: agents/{namespace}/{slug}.
func AgentDir(namespace, slug string) string {
	if namespace == "" {
		namespace = "team-default"
	}
	// Sanitize to prevent path traversal
	namespace = sanitizePath(namespace)
	slug = sanitizePath(slug)
	return fmt.Sprintf("agents/%s/%s", namespace, slug)
}

func sanitizePath(s string) string {
	s = strings.ReplaceAll(s, "..", "")
	s = strings.ReplaceAll(s, "/", "")
	s = strings.ReplaceAll(s, "\\", "")
	return s
}

// DeriveNamespace returns a K8s namespace for the given team ID.
func DeriveNamespace(teamID string) string {
	if teamID == "" {
		return "team-default"
	}
	name := strings.TrimPrefix(teamID, "tk_")
	name = strings.ToLower(name)
	if name == "" || strings.HasPrefix(name, "default") {
		return "team-default"
	}
	return "team-" + name
}

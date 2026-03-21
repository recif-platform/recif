package gitstate

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestArtifactToManifest_Basic(t *testing.T) {
	artifact := &AgentArtifact{
		Metadata: ArtifactMetadata{
			Name:     "test-agent",
			Version:  3,
			Checksum: "abc123",
			Status:   "active",
		},
		Runtime: RuntimeConfig{
			Image:    "ghcr.io/recif-platform/corail:latest",
			Channel:  "rest",
			Strategy: "agent-react",
			Replicas: 2,
		},
		Agent: AgentConfig{
			Model: ModelConfig{
				Provider: "openai",
				ID:       "gpt-4o",
			},
			SystemPrompt:   "You are a helpful assistant.",
			Tools:          []string{"web-search", "datetime"},
			Skills:         []string{"code-review"},
			KnowledgeBases: []string{"kb_001"},
			Memory:         MemoryConfig{Backend: "postgresql"},
		},
		Deployment: DeploymentConfig{
			Namespace: "team-default",
		},
	}

	manifest, err := ArtifactToManifest(artifact)
	if err != nil {
		t.Fatalf("ArtifactToManifest failed: %v", err)
	}

	// Parse back to verify structure
	var parsed map[string]interface{}
	if err := yaml.Unmarshal([]byte(manifest), &parsed); err != nil {
		t.Fatalf("invalid YAML output: %v", err)
	}

	// Check top-level fields
	if parsed["apiVersion"] != "agents.recif.dev/v1" {
		t.Errorf("apiVersion = %v, want agents.recif.dev/v1", parsed["apiVersion"])
	}
	if parsed["kind"] != "Agent" {
		t.Errorf("kind = %v, want Agent", parsed["kind"])
	}

	// Check metadata
	metadata, ok := parsed["metadata"].(map[string]interface{})
	if !ok {
		t.Fatal("metadata is not a map")
	}
	if metadata["name"] != "test-agent" {
		t.Errorf("metadata.name = %v, want test-agent", metadata["name"])
	}
	if metadata["namespace"] != "team-default" {
		t.Errorf("metadata.namespace = %v, want team-default", metadata["namespace"])
	}

	annotations, ok := metadata["annotations"].(map[string]interface{})
	if !ok {
		t.Fatal("annotations is not a map")
	}
	if annotations["recif.dev/release-version"] != "3" {
		t.Errorf("release-version = %v, want 3", annotations["recif.dev/release-version"])
	}

	// Check spec
	spec, ok := parsed["spec"].(map[string]interface{})
	if !ok {
		t.Fatal("spec is not a map")
	}
	if spec["name"] != "test-agent" {
		t.Errorf("spec.name = %v, want test-agent", spec["name"])
	}
	if spec["framework"] != "corail" {
		t.Errorf("spec.framework = %v, want corail", spec["framework"])
	}
	if spec["modelType"] != "openai" {
		t.Errorf("spec.modelType = %v, want openai", spec["modelType"])
	}
	if spec["modelId"] != "gpt-4o" {
		t.Errorf("spec.modelId = %v, want gpt-4o", spec["modelId"])
	}
	if spec["strategy"] != "agent-react" {
		t.Errorf("spec.strategy = %v, want agent-react", spec["strategy"])
	}
	if spec["systemPrompt"] != "You are a helpful assistant." {
		t.Errorf("spec.systemPrompt = %v", spec["systemPrompt"])
	}
	if spec["storage"] != "postgresql" {
		t.Errorf("spec.storage = %v, want postgresql", spec["storage"])
	}

	// Check replicas (YAML integers can come back as int)
	replicas, ok := spec["replicas"].(int)
	if !ok {
		t.Fatalf("spec.replicas is not int: %T", spec["replicas"])
	}
	if replicas != 2 {
		t.Errorf("spec.replicas = %v, want 2", replicas)
	}

	// Check tools
	tools, ok := spec["tools"].([]interface{})
	if !ok {
		t.Fatalf("spec.tools is not a slice: %T", spec["tools"])
	}
	if len(tools) != 2 {
		t.Errorf("len(tools) = %d, want 2", len(tools))
	}
}

func TestArtifactToManifest_MinimalFields(t *testing.T) {
	artifact := &AgentArtifact{
		Metadata: ArtifactMetadata{
			Name:    "minimal",
			Version: 1,
		},
		Runtime: RuntimeConfig{
			Image:    "corail:latest",
			Channel:  "rest",
			Strategy: "simple",
			Replicas: 0, // should default to 1
		},
		Agent: AgentConfig{
			Model: ModelConfig{
				Provider: "stub",
				ID:       "stub-echo",
			},
		},
		Deployment: DeploymentConfig{}, // empty namespace should default
	}

	manifest, err := ArtifactToManifest(artifact)
	if err != nil {
		t.Fatalf("ArtifactToManifest failed: %v", err)
	}

	var parsed map[string]interface{}
	if err := yaml.Unmarshal([]byte(manifest), &parsed); err != nil {
		t.Fatalf("invalid YAML: %v", err)
	}

	metadata := parsed["metadata"].(map[string]interface{})
	if metadata["namespace"] != "team-default" {
		t.Errorf("namespace = %v, want team-default (default)", metadata["namespace"])
	}

	spec := parsed["spec"].(map[string]interface{})
	replicas := spec["replicas"].(int)
	if replicas != 1 {
		t.Errorf("replicas = %d, want 1 (default)", replicas)
	}

	// Optional fields should NOT be present
	if _, ok := spec["systemPrompt"]; ok {
		t.Error("systemPrompt should not be present when empty")
	}
	if _, ok := spec["tools"]; ok {
		t.Error("tools should not be present when empty")
	}
	if _, ok := spec["storage"]; ok {
		t.Error("storage should not be present when empty")
	}
}

func TestAgentDir(t *testing.T) {
	tests := []struct {
		ns, slug, want string
	}{
		{"team-default", "poe", "agents/team-default/poe"},
		{"team-marketing", "hr-bot", "agents/team-marketing/hr-bot"},
		{"", "test", "agents/team-default/test"},
	}
	for _, tt := range tests {
		got := AgentDir(tt.ns, tt.slug)
		if got != tt.want {
			t.Errorf("AgentDir(%q, %q) = %q, want %q", tt.ns, tt.slug, got, tt.want)
		}
	}
}

func TestArtifactToManifest_ValidYAML(t *testing.T) {
	artifact := &AgentArtifact{
		Metadata: ArtifactMetadata{Name: "yaml-test", Version: 1},
		Runtime:  RuntimeConfig{Image: "corail:latest", Channel: "rest", Strategy: "simple", Replicas: 1},
		Agent:    AgentConfig{Model: ModelConfig{Provider: "ollama", ID: "qwen3.5:4b"}},
	}

	manifest, err := ArtifactToManifest(artifact)
	if err != nil {
		t.Fatalf("failed: %v", err)
	}

	// Should contain apiVersion and kind
	if !strings.Contains(manifest, "apiVersion: agents.recif.dev/v1") {
		t.Error("manifest missing apiVersion")
	}
	if !strings.Contains(manifest, "kind: Agent") {
		t.Error("manifest missing kind")
	}
}

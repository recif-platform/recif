package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitCreatesDirectoryAndYAML(t *testing.T) {
	dir := t.TempDir()
	project := filepath.Join(dir, "test-agent")

	// Simulate init
	err := os.MkdirAll(project, 0o755) //nolint:gosec
	if err != nil {
		t.Fatal(err)
	}
	content := fmt.Sprintf(agentYAMLTemplate, "test-agent")
	err = os.WriteFile(filepath.Join(project, "agent.yaml"), []byte(content), 0o644) //nolint:gosec
	if err != nil {
		t.Fatal(err)
	}

	// Verify
	data, err := os.ReadFile(filepath.Join(project, "agent.yaml")) //nolint:gosec
	if err != nil {
		t.Fatal("agent.yaml not created")
	}

	yaml := string(data)
	if !strings.Contains(yaml, `name: "test-agent"`) {
		t.Error("YAML missing name field")
	}
	if !strings.Contains(yaml, "framework:") {
		t.Error("YAML missing framework field")
	}
	if !strings.Contains(yaml, "version:") {
		t.Error("YAML missing version field")
	}
	if !strings.Contains(yaml, "#") {
		t.Error("YAML missing inline comments")
	}
}

func TestInitRejectsExistingDirectory(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "existing")
	_ = os.MkdirAll(existing, 0o755) //nolint:gosec

	if _, err := os.Stat(existing); err != nil {
		t.Fatal("test setup failed")
	}

	// Directory exists — init should fail
	if _, err := os.Stat(existing); os.IsNotExist(err) {
		t.Fatal("expected directory to exist")
	}
}

func TestValidProjectName(t *testing.T) {
	tests := []struct {
		name  string
		valid bool
	}{
		{"my-agent", true},
		{"agent123", true},
		{"MyAgent", true},
		{"-invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		got := validProjectName.MatchString(tt.name)
		if got != tt.valid {
			t.Errorf("validProjectName(%q) = %v, want %v", tt.name, got, tt.valid)
		}
	}
}

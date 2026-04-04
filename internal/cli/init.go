package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/spf13/cobra"
)

var validProjectName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9-]*$`)

const agentYAMLTemplate = `# Agent configuration for Récif platform
# See: https://github.com/sciences44/recif/docs/agent-yaml

name: "%s"              # Agent display name
framework: "corail"           # Framework: adk, langchain, crewai, autogen
description: ""            # What this agent does
version: "0.1.0"           # Semantic version

# LLM configuration
model: "gpt-4"             # LLM model identifier
llm_provider: "openai"     # Provider: openai, anthropic, ollama
temperature: 0.7           # 0.0 = deterministic, 2.0 = creative

# System prompt — defines agent behavior
system_prompt: |
  You are a helpful assistant.

# Tools this agent can use (empty = no tools)
tools: []

# Additional framework-specific configuration
config: {}
`

var initCmd = &cobra.Command{
	Use:   "init <project-name>",
	Short: "Initialize a new agent project with a YAML scaffold",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		name := args[0]

		if len(name) > 100 || !validProjectName.MatchString(name) {
			return fmt.Errorf("invalid project name %q: must be 1-100 alphanumeric characters or hyphens", name)
		}

		dir := filepath.Clean(name)
		if _, err := os.Stat(dir); err == nil {
			return fmt.Errorf("directory %q already exists", dir)
		}

		if err := os.MkdirAll(dir, 0o755); err != nil { //nolint:gosec // CLI scaffolding, standard perms
			return fmt.Errorf("create directory: %w", err)
		}

		yamlContent := fmt.Sprintf(agentYAMLTemplate, name)
		yamlPath := filepath.Join(dir, "agent.yaml")

		if err := os.WriteFile(yamlPath, []byte(yamlContent), 0o644); err != nil { //nolint:gosec // YAML config, world-readable is fine
			return fmt.Errorf("write agent.yaml: %w", err)
		}

		fmt.Printf("Agent project initialized in %s/\n", name)
		fmt.Println("")
		fmt.Println("Next steps:")
		fmt.Printf("  cd %s\n", name)
		fmt.Println("  # Edit agent.yaml to configure your agent")
		fmt.Println("  recif register  # Register agent with the platform")

		return nil
	},
}

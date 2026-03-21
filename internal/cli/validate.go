package cli

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
	"gopkg.in/yaml.v3"
)

var cliValidate = validator.New()

// AgentYAML represents the agent.yaml file structure.
type AgentYAML struct {
	Name         string         `yaml:"name" validate:"required,min=1,max=255"`
	Framework    string         `yaml:"framework" validate:"required,oneof=corail langchain crewai autogen"`
	Description  string         `yaml:"description" validate:"max=500"`
	Version      string         `yaml:"version" validate:"required,min=1,max=20"`
	Model        string         `yaml:"model"`
	LLMProvider  string         `yaml:"llm_provider"`
	SystemPrompt string         `yaml:"system_prompt"`
	Temperature  float64        `yaml:"temperature"`
	Tools        []string       `yaml:"tools"`
	Config       map[string]any `yaml:"config"`
}

// ValidateAgentYAML parses and validates agent YAML content.
func ValidateAgentYAML(data []byte) (*AgentYAML, error) {
	var agent AgentYAML
	if err := yaml.Unmarshal(data, &agent); err != nil {
		return nil, fmt.Errorf("invalid YAML syntax: %w", err)
	}

	if err := cliValidate.Struct(agent); err != nil {
		return nil, fmt.Errorf("validation failed:\n%s", formatCLIValidationErrors(err))
	}

	return &agent, nil
}

func formatCLIValidationErrors(err error) string {
	var msgs []string
	if ve, ok := err.(validator.ValidationErrors); ok { //nolint:errorlint // validator returns concrete type
		for _, fe := range ve {
			field := strings.ToLower(fe.Field())
			switch fe.Tag() {
			case "required":
				msgs = append(msgs, fmt.Sprintf("  - %s: required field is missing", field))
			case "oneof":
				msgs = append(msgs, fmt.Sprintf("  - %s: must be one of: %s (got %q)", field, fe.Param(), fe.Value()))
			case "max":
				msgs = append(msgs, fmt.Sprintf("  - %s: exceeds maximum length of %s", field, fe.Param()))
			default:
				msgs = append(msgs, fmt.Sprintf("  - %s: %s", field, fe.Tag()))
			}
		}
	}
	return strings.Join(msgs, "\n")
}

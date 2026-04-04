package skill

import "time"

// Skill represents an agent skill -- a mini-package of metadata, instructions, and optional resources.
// Aligned with the Anthropic skills format: SKILL.md + scripts/ + references/ + assets/.
type Skill struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Instructions  string            `json:"instructions"`
	Category      string            `json:"category"`
	Version       string            `json:"version"`
	Author        string            `json:"author"`
	Source        string            `json:"source"`
	Compatibility []string          `json:"compatibility"`
	ChannelFilter []string          `json:"channel_filter"`
	Tools         []string          `json:"tools"`
	Scripts       map[string]string `json:"scripts,omitempty"`
	References    map[string]string `json:"references,omitempty"`
	Assets        map[string]string `json:"assets,omitempty"`
	Builtin       bool              `json:"builtin"`
	CreatedAt     time.Time         `json:"created_at"`
}

// CreateParams holds the parameters for creating or updating a custom skill.
type CreateParams struct {
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Instructions  string            `json:"instructions"`
	Category      string            `json:"category"`
	Version       string            `json:"version"`
	Author        string            `json:"author"`
	Compatibility []string          `json:"compatibility"`
	ChannelFilter []string          `json:"channel_filter"`
	Tools         []string          `json:"tools"`
	Scripts       map[string]string `json:"scripts,omitempty"`
	References    map[string]string `json:"references,omitempty"`
}

// ImportParams holds the parameters for importing a skill from an external source.
type ImportParams struct {
	Source string `json:"source"` // e.g. "github:anthropics/skills/skills/pdf"
	Token  string `json:"token"`  // optional GitHub token
}

// builtinSkills contains the 5 built-in skills matching the Python runtime.
var builtinSkills = []Skill{
	{
		ID:          "agui-render",
		Name:        "Rich Rendering",
		Description: "Render rich content: 3D scenes, charts, flow diagrams, HTML preview via AG-UI protocol.",
		Category:    "rendering",
		Version:     "1.0.0",
		Author:      "recif",
		Source:      "builtin",
		Instructions: "You can produce rich visual content using structured AG-UI artifacts. " +
			"Supported types: three_scene (3D), chart (Chart.js), flow_diagram (Mermaid), " +
			"html_preview, code_artifact, and data_table.",
		Compatibility: []string{},
		ChannelFilter: []string{"rest"},
		Tools:         []string{},
		Builtin:       true,
	},
	{
		ID:            "code-review",
		Name:          "Code Review",
		Description:   "Expert code analysis covering security, performance, and best practices.",
		Category:      "analysis",
		Version:       "1.0.0",
		Author:        "recif",
		Source:        "builtin",
		Instructions:  "You are an expert code reviewer. Analyze code for correctness, security vulnerabilities, performance issues, and adherence to best practices. Provide actionable feedback.",
		Compatibility: []string{},
		ChannelFilter: []string{},
		Tools:         []string{},
		Builtin:       true,
	},
	{
		ID:            "doc-writer",
		Name:          "Documentation",
		Description:   "Technical writing: API docs, tutorials, README generation.",
		Category:      "writing",
		Version:       "1.0.0",
		Author:        "recif",
		Source:        "builtin",
		Instructions:  "You are a technical writer. Produce clear, well-structured documentation including API references, tutorials, and README files. Use proper markdown formatting.",
		Compatibility: []string{},
		ChannelFilter: []string{},
		Tools:         []string{},
		Builtin:       true,
	},
	{
		ID:          "data-analyst",
		Name:        "Data Analysis",
		Description: "Statistical analysis with visualizations and insights.",
		Category:    "analysis",
		Version:     "1.0.0",
		Author:      "recif",
		Source:      "builtin",
		Instructions: "You are a data analyst. Perform statistical analysis, identify trends, and present " +
			"findings with clear visualizations. Use the calculator tool for precise computations.",
		Compatibility: []string{},
		ChannelFilter: []string{"rest"},
		Tools:         []string{"calculator"},
		Builtin:       true,
	},
	{
		ID:          "infra-deployer",
		Name:        "Infra Deployer",
		Description: "Deploy and manage Récif platform infrastructure — local (Kind + Helm) or cloud (Terraform + EKS/GKE/AKS). Triggers on: deploy, setup, terraform, helm, kind, kubernetes, scale, upgrade, teardown.",
		Category:    "infrastructure",
		Version:     "1.0.0",
		Author:      "recif",
		Source:      "builtin",
		Instructions: "Infrastructure deployment expert for Récif. Supports local setup (Kind + Helm) and cloud (Terraform + EKS). " +
			"Local: cd deploy/kind && bash setup.sh. Cloud: cd deploy/terraform/environments/dev && terraform apply. " +
			"Key operations: health check, scale agents, add Ollama models, upgrade via Helm, troubleshoot pods/network/DB.",
		Compatibility: []string{"kubectl", "helm", "kind", "terraform"},
		ChannelFilter: []string{},
		Tools:         []string{"web_search"},
		Scripts: map[string]string{
			"setup-local.sh":  "Local Kind + Helm setup. Usage: bash setup-local.sh [--gpu]",
			"setup-cloud.sh":  "Cloud Terraform setup. Usage: bash setup-cloud.sh --env dev|prod --region us-east-1",
			"health-check.sh": "Cluster health check. Usage: bash health-check.sh [namespace]",
		},
		References: map[string]string{
			"helm-values.md":       "Complete Helm chart values reference",
			"terraform-modules.md": "Terraform modules reference",
			"troubleshooting.md":   "Troubleshooting guide",
		},
		Builtin:       true,
	},
}

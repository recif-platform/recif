package integration

import "time"

// Integration represents a platform-level connection to an external service.
type Integration struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`   // github, aws, jira, jenkins, slack, gcp, terraform, datadog
	Status    string            `json:"status"` // connected, disconnected, error
	Config    map[string]string `json:"config"` // non-sensitive config (org, project, region)
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

// CreateParams holds the parameters for creating a new integration.
type CreateParams struct {
	Name        string            `json:"name" validate:"required"`
	Type        string            `json:"type" validate:"required"`
	Config      map[string]string `json:"config"`
	Credentials map[string]string `json:"credentials"` // sensitive, stored separately
}

// IntegrationType describes an available integration type and its fields.
type IntegrationType struct {
	Type             string        `json:"type"`
	Label            string        `json:"label"`
	Description      string        `json:"description"`
	Icon             string        `json:"icon"`
	ConfigFields     []ConfigField `json:"config_fields"`
	CredentialFields []ConfigField `json:"credential_fields"`
	ExposedTools     []string      `json:"exposed_tools"`
}

// ConfigField describes a single configuration or credential field.
type ConfigField struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Type        string `json:"type"` // text, password, url, select
	Required    bool   `json:"required"`
	Placeholder string `json:"placeholder"`
}

// integrationTypeRegistry maps type keys to their IntegrationType definitions.
var integrationTypeRegistry = map[string]IntegrationType{
	"github": {
		Type:        "github",
		Label:       "GitHub",
		Description: "Source control, issues, and pull requests",
		Icon:        "github",
		ConfigFields: []ConfigField{
			{Key: "org", Label: "Organization", Type: "text", Required: false, Placeholder: "e.g. my-org"},
		},
		CredentialFields: []ConfigField{
			{Key: "token", Label: "Personal Access Token", Type: "password", Required: true, Placeholder: "ghp_..."},
		},
		ExposedTools: []string{"github_list_repos", "github_create_issue", "github_list_prs", "github_merge_pr"},
	},
	"jira": {
		Type:        "jira",
		Label:       "Jira",
		Description: "Project tracking and issue management",
		Icon:        "jira",
		ConfigFields: []ConfigField{
			{Key: "url", Label: "Jira URL", Type: "url", Required: true, Placeholder: "https://your-domain.atlassian.net"},
			{Key: "project_key", Label: "Project Key", Type: "text", Required: false, Placeholder: "e.g. PROJ"},
		},
		CredentialFields: []ConfigField{
			{Key: "email", Label: "Email", Type: "text", Required: true, Placeholder: "user@example.com"},
			{Key: "api_token", Label: "API Token", Type: "password", Required: true, Placeholder: "Jira API token"},
		},
		ExposedTools: []string{"jira_list_issues", "jira_create_issue", "jira_update_issue"},
	},
	"jenkins": {
		Type:        "jenkins",
		Label:       "Jenkins",
		Description: "CI/CD pipeline automation",
		Icon:        "jenkins",
		ConfigFields: []ConfigField{
			{Key: "url", Label: "Jenkins URL", Type: "url", Required: true, Placeholder: "https://jenkins.example.com"},
		},
		CredentialFields: []ConfigField{
			{Key: "username", Label: "Username", Type: "text", Required: true, Placeholder: "admin"},
			{Key: "api_token", Label: "API Token", Type: "password", Required: true, Placeholder: "Jenkins API token"},
		},
		ExposedTools: []string{"jenkins_list_jobs", "jenkins_trigger_build", "jenkins_build_status"},
	},
	"slack": {
		Type:        "slack",
		Label:       "Slack",
		Description: "Team messaging and notifications",
		Icon:        "slack",
		ConfigFields: []ConfigField{
			{Key: "workspace", Label: "Workspace", Type: "text", Required: false, Placeholder: "e.g. my-workspace"},
		},
		CredentialFields: []ConfigField{
			{Key: "bot_token", Label: "Bot Token", Type: "password", Required: true, Placeholder: "xoxb-..."},
		},
		ExposedTools: []string{"slack_send_message", "slack_list_channels"},
	},
	"aws": {
		Type:        "aws",
		Label:       "AWS",
		Description: "Amazon Web Services cloud infrastructure",
		Icon:        "aws",
		ConfigFields: []ConfigField{
			{Key: "region", Label: "Region", Type: "text", Required: true, Placeholder: "e.g. us-east-1"},
			{Key: "account_id", Label: "Account ID", Type: "text", Required: false, Placeholder: "123456789012"},
		},
		CredentialFields: []ConfigField{
			{Key: "access_key_id", Label: "Access Key ID", Type: "text", Required: true, Placeholder: "AKIA..."},
			{Key: "secret_access_key", Label: "Secret Access Key", Type: "password", Required: true, Placeholder: "Secret key"},
		},
		ExposedTools: []string{"aws_list_resources", "aws_describe_instance"},
	},
	"gcp": {
		Type:        "gcp",
		Label:       "Google Cloud",
		Description: "Google Cloud Platform infrastructure",
		Icon:        "gcp",
		ConfigFields: []ConfigField{
			{Key: "project_id", Label: "Project ID", Type: "text", Required: true, Placeholder: "my-gcp-project"},
			{Key: "region", Label: "Region", Type: "text", Required: false, Placeholder: "e.g. us-central1"},
		},
		CredentialFields: []ConfigField{
			{Key: "service_account_json", Label: "Service Account JSON", Type: "password", Required: true, Placeholder: "Paste service account JSON"},
		},
		ExposedTools: []string{"gcp_list_resources", "gcp_describe_instance"},
	},
	"datadog": {
		Type:        "datadog",
		Label:       "Datadog",
		Description: "Monitoring, alerting, and observability",
		Icon:        "datadog",
		ConfigFields: []ConfigField{
			{Key: "site", Label: "Datadog Site", Type: "text", Required: false, Placeholder: "e.g. datadoghq.com"},
		},
		CredentialFields: []ConfigField{
			{Key: "api_key", Label: "API Key", Type: "password", Required: true, Placeholder: "Datadog API key"},
			{Key: "app_key", Label: "Application Key", Type: "password", Required: true, Placeholder: "Datadog app key"},
		},
		ExposedTools: []string{"datadog_query_metrics", "datadog_list_monitors", "datadog_create_alert"},
	},
	"terraform": {
		Type:        "terraform",
		Label:       "Terraform",
		Description: "Infrastructure as Code management",
		Icon:        "terraform",
		ConfigFields: []ConfigField{
			{Key: "workspace_url", Label: "Workspace URL", Type: "url", Required: false, Placeholder: "https://app.terraform.io"},
			{Key: "organization", Label: "Organization", Type: "text", Required: true, Placeholder: "my-org"},
		},
		CredentialFields: []ConfigField{
			{Key: "api_token", Label: "API Token", Type: "password", Required: true, Placeholder: "Terraform Cloud token"},
		},
		ExposedTools: []string{"terraform_list_workspaces", "terraform_plan_status", "terraform_apply"},
	},
}

// IntegrationTypes returns the ordered list of available integration types.
func IntegrationTypes() []IntegrationType {
	order := []string{"github", "jira", "jenkins", "slack", "aws", "gcp", "datadog", "terraform"}
	types := make([]IntegrationType, 0, len(order))
	for _, key := range order {
		types = append(types, integrationTypeRegistry[key])
	}
	return types
}

// LookupType returns the IntegrationType for the given key, if it exists.
func LookupType(key string) (IntegrationType, bool) {
	t, ok := integrationTypeRegistry[key]
	return t, ok
}

package governance

import "time"

// Scorecard represents the governance score of an agent across multiple dimensions.
type Scorecard struct {
	AgentID    string         `json:"agent_id"`
	AgentName  string         `json:"agent_name"`
	Overall    float64        `json:"overall"`
	Quality    ScoreDimension `json:"quality"`
	Safety     ScoreDimension `json:"safety"`
	Cost       ScoreDimension `json:"cost"`
	Compliance ScoreDimension `json:"compliance"`
	DataSource string         `json:"data_source,omitempty"` // "mlflow" or empty (mock fallback)
	UpdatedAt  time.Time      `json:"updated_at"`
}

// ScoreDimension represents a single dimension of a scorecard.
type ScoreDimension struct {
	Score   float64  `json:"score"`
	Grade   string   `json:"grade"`
	Metrics []Metric `json:"metrics"`
}

// Metric is a single measurable value within a dimension.
type Metric struct {
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Unit      string  `json:"unit"`
	Threshold float64 `json:"threshold"`
	Status    string  `json:"status"`
}

// GuardrailPolicy defines governance rules enforced on agents.
type GuardrailPolicy struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Rules       []Rule `json:"rules"`
	Severity    string `json:"severity"`
	Enabled     bool   `json:"enabled"`
}

// Rule is a single constraint within a guardrail policy.
type Rule struct {
	Type     string `json:"type"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

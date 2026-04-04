package evaluation

import "time"

// EvalRun represents a single evaluation execution.
type EvalRun struct {
	ID              string             `json:"id"`
	AgentID         string             `json:"agent_id"`
	AgentVersion    string             `json:"agent_version"`
	DatasetName     string             `json:"dataset_name"`
	Status          string             `json:"status"`
	AggregateScores map[string]float64 `json:"aggregate_scores"`
	TotalCases      int                `json:"total_cases"`
	PassedCases     int                `json:"passed_cases"`
	StartedAt       time.Time          `json:"started_at"`
	CompletedAt     *time.Time         `json:"completed_at,omitempty"`
}

// EvalComparison holds the result of comparing two evaluation runs.
type EvalComparison struct {
	RunA    string                   `json:"run_a"`
	RunB    string                   `json:"run_b"`
	Metrics map[string]MetricCompare `json:"metrics"`
	Winner  string                   `json:"winner"`
}

// MetricCompare holds the comparison of a single metric between two runs.
type MetricCompare struct {
	A      float64 `json:"a"`
	B      float64 `json:"b"`
	Diff   float64 `json:"diff"`
	Winner string  `json:"winner"`
}

// TriggerEvalRequest is the payload for triggering a new evaluation run.
type TriggerEvalRequest struct {
	DatasetName string `json:"dataset_name" validate:"required"`
	Version     string `json:"version"`
	Provider    string `json:"provider"` // mlflow, phoenix, memory
}

// Dataset represents a golden evaluation dataset.
type Dataset struct {
	Name      string    `json:"name"`
	CaseCount int       `json:"case_count"`
	CreatedAt time.Time `json:"created_at"`
}

package eval

import "time"

// GoldenDataset holds curated test scenarios for an agent.
type GoldenDataset struct {
	ID        string     `json:"id"`
	AgentID   string     `json:"agent_id"`
	TeamID    string     `json:"team_id"`
	Name      string     `json:"name"`
	CaseCount int        `json:"case_count"`
	Cases     []EvalCase `json:"cases,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// EvalCase is a single test case in a golden dataset.
type EvalCase struct {
	Input          string            `json:"input"`
	ExpectedOutput string            `json:"expected_output,omitempty"`
	Context        string            `json:"context,omitempty"`
	Metadata       map[string]string `json:"metadata,omitempty"`
}

// EvalRun represents a single evaluation execution.
type EvalRun struct {
	ID              string             `json:"id"`
	AgentID         string             `json:"agent_id"`
	AgentVersion    string             `json:"agent_version"`
	DatasetName     string             `json:"dataset_name"`
	TeamID          string             `json:"team_id"`
	Status          string             `json:"status"` // pending, running, completed, failed
	AggregateScores map[string]float64 `json:"aggregate_scores,omitempty"`
	TotalCases      int                `json:"total_cases"`
	PassedCases     int                `json:"passed_cases"`
	Provider        string             `json:"provider"`
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

// RiskProfile defines quality thresholds for agent deployment.
type RiskProfile struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	MinScore    float64 `json:"min_score"`
	Description string  `json:"description,omitempty"`
}

// TriggerEvalRequest is the payload for triggering a new evaluation run.
type TriggerEvalRequest struct {
	DatasetName string `json:"dataset_name" validate:"required"`
	Version     string `json:"version"`
	Provider    string `json:"provider"` // mlflow, phoenix, memory
}

// CreateDatasetRequest is the payload for creating a new dataset.
type CreateDatasetRequest struct {
	Name  string     `json:"name" validate:"required"`
	Cases []EvalCase `json:"cases" validate:"required"`
}

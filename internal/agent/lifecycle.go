package agent

import "fmt"

const (
	StatusEvaluating  AgentStatus = "evaluating"
	StatusEvaluated   AgentStatus = "evaluated"
	StatusEvalFailed  AgentStatus = "eval_failed"
	StatusDeploying   AgentStatus = "deploying"
	StatusDeployed    AgentStatus = "deployed"
	StatusDeployFailed AgentStatus = "deploy_failed"
)

// validTransitions defines allowed status transitions.
var validTransitions = map[AgentStatus][]AgentStatus{
	StatusRegistered:   {StatusEvaluating},
	StatusEvaluating:   {StatusEvaluated, StatusEvalFailed},
	StatusEvaluated:    {StatusDeploying},
	StatusEvalFailed:   {StatusEvaluating}, // retry
	StatusDeploying:    {StatusDeployed, StatusDeployFailed},
	StatusDeployFailed: {StatusDeploying}, // retry
}

// allStatuses is the set of valid status values.
var allStatuses = map[AgentStatus]bool{
	StatusRegistered:   true,
	StatusDraft:        true,
	StatusActive:       true,
	StatusArchived:     true,
	StatusEvaluating:   true,
	StatusEvaluated:    true,
	StatusEvalFailed:   true,
	StatusDeploying:    true,
	StatusDeployed:     true,
	StatusDeployFailed: true,
}

// IsValidStatus checks if a status string is a known constant.
func IsValidStatus(s AgentStatus) bool {
	return allStatuses[s]
}

// ValidateTransition checks if a status transition is allowed.
func ValidateTransition(current, next AgentStatus) error {
	if !IsValidStatus(next) {
		return fmt.Errorf("unknown status %q", next)
	}
	allowed, ok := validTransitions[current]
	if !ok {
		return fmt.Errorf("no transitions allowed from status %q", current)
	}
	for _, s := range allowed {
		if s == next {
			return nil
		}
	}
	return fmt.Errorf("invalid transition from %q to %q", current, next)
}

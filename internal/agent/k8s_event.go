package agent

import "time"

// K8sEvent is a typed representation of a Kubernetes event related to an agent.
type K8sEvent struct {
	Type       string    `json:"type"`
	Reason     string    `json:"reason"`
	Message    string    `json:"message"`
	ObjectKind string    `json:"object_kind"`
	ObjectName string    `json:"object_name"`
	Timestamp  time.Time `json:"timestamp"`
	Count      int32     `json:"count"`
}

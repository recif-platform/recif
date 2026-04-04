package feedback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/sciences44/recif/internal/httputil"
)

// DatasetAppender can add eval test cases to an agent's dataset.
type DatasetAppender interface {
	AppendCase(agentID, input, expectedOutput string)
}

// Handler provides HTTP handlers for user/expert feedback on agent traces.
// Proxies feedback to MLflow and implements the feedback→dataset loop.
type Handler struct {
	mlflowURI string
	logger    *slog.Logger
	datasets  DatasetAppender // nil = dataset loop disabled
}

// NewHandler creates a new feedback Handler.
func NewHandler(mlflowURI string, logger *slog.Logger, datasets ...DatasetAppender) *Handler {
	var ds DatasetAppender
	if len(datasets) > 0 {
		ds = datasets[0]
	}
	return &Handler{mlflowURI: mlflowURI, logger: logger, datasets: ds}
}

// submitRequest is the JSON payload for feedback submission.
type submitRequest struct {
	TraceID        string  `json:"trace_id"`
	Name           string  `json:"name" validate:"required"`
	Value          float64 `json:"value"`
	Source         string  `json:"source"`
	Comment        string  `json:"comment,omitempty"`
	AgentID        string  `json:"agent_id,omitempty"`
	ConversationID string  `json:"conversation_id,omitempty"`
}

// Submit handles POST /api/v1/feedback.
// Proxies feedback to MLflow as an assessment, and on negative feedback
// appends the trace's input as a new test case in the agent's eval dataset.
func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	var req submitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", err.Error(), r.URL.Path)
		return
	}

	// Resolve trace_id from conversation_id if not provided
	if (req.TraceID == "" || req.TraceID == "pending") && req.ConversationID != "" && h.mlflowURI != "" {
		if resolved := h.resolveTraceFromConversation(req.ConversationID, req.AgentID); resolved != "" {
			req.TraceID = resolved
		}
	}

	h.logger.Info("feedback_received", "trace_id", req.TraceID, "name", req.Name, "value", req.Value)

	// Proxy to MLflow if available
	if h.mlflowURI != "" && req.TraceID != "" && req.TraceID != "pending" {
		if err := h.proxyToMLflow(req); err != nil {
			h.logger.Warn("mlflow_feedback_proxy_failed", "error", err)
		}
	}

	// Negative feedback loop: extract trace input and add to eval dataset.
	// Threshold: value < 3 on a 1-5 scale, or value < 0.6 on 0-1 scale.
	isNegative := (req.Value >= 1 && req.Value < 3) || (req.Value >= 0 && req.Value < 0.6)
	datasetAppended := false
	if isNegative && req.AgentID != "" {
		datasetAppended = h.appendToDataset(req)
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"status":           "recorded",
		"trace_id":         req.TraceID,
		"name":             req.Name,
		"value":            req.Value,
		"proxied":          h.mlflowURI != "",
		"dataset_appended": datasetAppended,
	})
}

// appendToDataset extracts the trace's input from MLflow and adds it as a test case.
func (h *Handler) appendToDataset(req submitRequest) bool {
	// Try to fetch the trace input from MLflow
	traceInput := h.extractTraceInput(req.TraceID)
	if traceInput == "" {
		// If MLflow unavailable, use the comment as a description
		traceInput = req.Comment
	}
	if traceInput == "" {
		h.logger.Debug("no_input_for_dataset", "trace_id", req.TraceID)
		return false
	}

	if h.datasets != nil {
		h.datasets.AppendCase(req.AgentID, traceInput, "")
		h.logger.Info("feedback_to_dataset", "trace_id", req.TraceID, "agent_id", req.AgentID,
			"input_preview", truncate(traceInput, 80))
		return true
	}

	h.logger.Info("negative_feedback_flagged_no_appender", "trace_id", req.TraceID, "agent_id", req.AgentID)
	return false
}

// extractTraceInput fetches the user input from an MLflow trace.
func (h *Handler) extractTraceInput(traceID string) string {
	if h.mlflowURI == "" {
		return ""
	}
	url := fmt.Sprintf("%s/api/2.0/mlflow/traces/%s", h.mlflowURI, traceID)
	resp, err := http.Get(url) //nolint:gosec // internal service call
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var trace struct {
		Info struct {
			RequestPreview string `json:"request_preview"`
		} `json:"info"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&trace); err != nil {
		return ""
	}
	return trace.Info.RequestPreview
}

// proxyToMLflow sends the feedback as an MLflow v3 assessment on the trace.
func (h *Handler) proxyToMLflow(req submitRequest) error {
	now := time.Now().UTC().Format(time.RFC3339)
	isPositive := req.Value >= 0.5
	body := map[string]any{
		"assessment": map[string]any{
			"assessment_name": req.Name,
			"trace_id":        req.TraceID,
			"source": map[string]any{
				"source_type": "HUMAN",
				"source_id":   req.Source,
			},
			"create_time":      now,
			"last_update_time": now,
			"feedback": map[string]any{
				"value": isPositive,
			},
			"rationale": req.Comment,
			"valid":     true,
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal feedback: %w", err)
	}

	url := fmt.Sprintf("%s/api/3.0/mlflow/traces/%s/assessments", h.mlflowURI, req.TraceID)
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody)) //nolint:gosec
	if err != nil {
		return fmt.Errorf("POST to MLflow: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	h.logger.Debug("mlflow_feedback_proxied", "trace_id", req.TraceID, "status", resp.StatusCode)
	return nil
}

// resolveTraceFromConversation finds the latest trace with a matching conversation_id tag.
func (h *Handler) resolveTraceFromConversation(conversationID, agentID string) string {
	if h.mlflowURI == "" {
		return ""
	}

	// Search experiment for traces with this session/conversation
	expName := "recif/agents/" + agentID
	searchBody := map[string]any{
		"filter":      fmt.Sprintf("name = '%s'", expName),
		"max_results": 1,
	}
	jsonBody, _ := json.Marshal(searchBody)
	resp, err := http.Post(h.mlflowURI+"/api/2.0/mlflow/experiments/search", "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var expResp struct {
		Experiments []struct {
			ExperimentID string `json:"experiment_id"`
		} `json:"experiments"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&expResp); err != nil || len(expResp.Experiments) == 0 {
		return ""
	}

	// Search traces with this conversation_id as session tag
	tracesURL := fmt.Sprintf("%s/api/2.0/mlflow/traces?experiment_ids=%s&max_results=5&order_by=timestamp_ms+DESC",
		h.mlflowURI, expResp.Experiments[0].ExperimentID)
	resp2, err := http.Get(tracesURL) //nolint:gosec
	if err != nil {
		return ""
	}
	defer resp2.Body.Close()
	var tracesResp struct {
		Traces []struct {
			RequestID       string `json:"request_id"`
			RequestMetadata []struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			} `json:"request_metadata"`
		} `json:"traces"`
	}
	if err := json.NewDecoder(resp2.Body).Decode(&tracesResp); err != nil {
		return ""
	}

	for _, t := range tracesResp.Traces {
		for _, m := range t.RequestMetadata {
			if m.Key == "mlflow.trace.session" && m.Value == conversationID {
				h.logger.Info("resolved_trace_from_conversation", "conversation_id", conversationID, "trace_id", t.RequestID)
				return t.RequestID
			}
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

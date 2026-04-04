package feedback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

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
	TraceID string  `json:"trace_id" validate:"required"`
	Name    string  `json:"name" validate:"required"` // "user_rating", "expert_label", etc.
	Value   float64 `json:"value"`
	Source  string  `json:"source"` // "user" or "expert"
	Comment string  `json:"comment,omitempty"`
	AgentID string  `json:"agent_id,omitempty"` // for dataset loop
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

	h.logger.Info("feedback_received", "trace_id", req.TraceID, "name", req.Name, "value", req.Value)

	// Proxy to MLflow if available
	if h.mlflowURI != "" {
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

// proxyToMLflow sends the feedback as an MLflow assessment on the trace.
func (h *Handler) proxyToMLflow(req submitRequest) error {
	body := map[string]any{
		"name":  req.Name,
		"value": req.Value,
		"source": map[string]any{
			"source_type": "HUMAN",
			"source_id":   req.Source,
		},
		"rationale": req.Comment,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal feedback: %w", err)
	}

	url := fmt.Sprintf("%s/api/2.0/mlflow/traces/%s/assessments", h.mlflowURI, req.TraceID)
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody)) //nolint:gosec
	if err != nil {
		return fmt.Errorf("POST to MLflow: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	h.logger.Debug("mlflow_feedback_proxied", "trace_id", req.TraceID, "status", resp.StatusCode)
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

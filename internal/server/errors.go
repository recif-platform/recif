package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// ProblemDetail implements RFC 7807 Problem Details for HTTP APIs.
type ProblemDetail struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance,omitempty"`
}

// WriteError writes an RFC 7807 error response.
func WriteError(w http.ResponseWriter, status int, title, detail, instance string) {
	problem := ProblemDetail{
		Type:     "https://recif.dev/errors/" + http.StatusText(status),
		Title:    title,
		Status:   status,
		Detail:   detail,
		Instance: instance,
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(problem); err != nil {
		slog.Error("failed to encode error response", "error", err)
	}
}

// WriteJSON writes a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

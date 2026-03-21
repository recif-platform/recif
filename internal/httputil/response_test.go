package httputil

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteJSON_StatusAndBody(t *testing.T) {
	rec := httptest.NewRecorder()
	data := map[string]string{"status": "ok"}
	WriteJSON(rec, http.StatusOK, data)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["status"] != "ok" {
		t.Errorf("body status = %q, want ok", got["status"])
	}
}

func TestWriteJSON_CustomStatus(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, http.StatusCreated, map[string]int{"id": 1})

	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusCreated)
	}
}

func TestWriteJSON_NilData(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, http.StatusOK, nil)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	// json.Encode(nil) produces "null\n"
	body := rec.Body.String()
	if body != "null\n" {
		t.Errorf("body = %q, want %q", body, "null\n")
	}
}

func TestWriteError_ProblemDetail(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusNotFound, "Not Found", "Agent 'foo' does not exist", "/api/v1/agents/foo")

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/problem+json" {
		t.Errorf("Content-Type = %q, want application/problem+json", ct)
	}

	var problem ProblemDetail
	if err := json.NewDecoder(rec.Body).Decode(&problem); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if problem.Type != "https://recif.dev/errors/Not Found" {
		t.Errorf("type = %q, want https://recif.dev/errors/Not Found", problem.Type)
	}
	if problem.Title != "Not Found" {
		t.Errorf("title = %q, want Not Found", problem.Title)
	}
	if problem.Status != http.StatusNotFound {
		t.Errorf("status = %d, want %d", problem.Status, http.StatusNotFound)
	}
	if problem.Detail != "Agent 'foo' does not exist" {
		t.Errorf("detail = %q, want %q", problem.Detail, "Agent 'foo' does not exist")
	}
	if problem.Instance != "/api/v1/agents/foo" {
		t.Errorf("instance = %q, want /api/v1/agents/foo", problem.Instance)
	}
}

func TestWriteError_BadRequest(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusBadRequest, "Bad Request", "invalid input", "/test")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var problem ProblemDetail
	if err := json.NewDecoder(rec.Body).Decode(&problem); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if problem.Status != http.StatusBadRequest {
		t.Errorf("problem.Status = %d, want 400", problem.Status)
	}
}

func TestWriteError_EmptyInstance(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusInternalServerError, "Internal Server Error", "something broke", "")

	var problem ProblemDetail
	if err := json.NewDecoder(rec.Body).Decode(&problem); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// instance is omitempty, so it should not appear when empty
	if problem.Instance != "" {
		t.Errorf("instance = %q, want empty", problem.Instance)
	}
}

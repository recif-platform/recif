package kb

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

const (
	uploadDir      = "/tmp/maree-uploads"
	maxUploadBytes = 100 << 20 // 100 MB
)

var validate = validator.New()

// Handler provides HTTP handlers for knowledge base operations.
type Handler struct {
	store  *Store
	logger *slog.Logger
}

// NewHandler creates a new knowledge base Handler.
func NewHandler(store *Store, logger *slog.Logger) *Handler {
	return &Handler{store: store, logger: logger}
}

// unavailable writes a 503 response when the KB store is not configured.
func (h *Handler) unavailable(w http.ResponseWriter, r *http.Request) bool {
	if h.store == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Service Unavailable", "Knowledge base database not configured", r.URL.Path)
		return true
	}
	return false
}

// List handles GET /api/v1/knowledge-bases.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	kbs, err := h.store.List(r.Context())
	if err != nil {
		h.logger.Error("list knowledge bases failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list knowledge bases", r.URL.Path)
		return
	}

	if kbs == nil {
		kbs = []KnowledgeBase{}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": kbs})
}

// Get handles GET /api/v1/knowledge-bases/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")

	kb, err := h.store.Get(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Knowledge base not found", r.URL.Path)
		return
	}
	if err != nil {
		h.logger.Error("get knowledge base failed", "error", err, "id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get knowledge base", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": kb})
}

// Create handles POST /api/v1/knowledge-bases.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	var req CreateParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if err := validate.Struct(req); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", formatValidationErrors(err), r.URL.Path)
		return
	}

	teamID := middleware.TeamFromContext(r.Context())
	kb, err := h.store.Create(r.Context(), req, teamID)
	if err != nil {
		h.logger.Error("create knowledge base failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create knowledge base", r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"data": kb})
}

// ListDocuments handles GET /api/v1/knowledge-bases/{id}/documents.
func (h *Handler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")

	// Verify KB exists
	if _, err := h.store.Get(r.Context(), id); errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Knowledge base not found", r.URL.Path)
		return
	}

	docs, err := h.store.ListDocuments(r.Context(), id)
	if err != nil {
		h.logger.Error("list documents failed", "error", err, "kb_id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to list documents", r.URL.Path)
		return
	}

	if docs == nil {
		docs = []Document{}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": docs})
}

// Ingest handles POST /api/v1/knowledge-bases/{id}/ingest.
// Accepts a multipart file upload, saves it to disk, and creates a pending document entry.
func (h *Handler) Ingest(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")

	// Verify KB exists
	if _, err := h.store.Get(r.Context(), id); errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Knowledge base not found", r.URL.Path)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Upload Error", "Failed to parse multipart form", r.URL.Path)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Upload Error", "Missing 'file' field in multipart form", r.URL.Path)
		return
	}
	defer file.Close()

	// Ensure upload directory exists
	kbDir := filepath.Join(uploadDir, id)
	if err := os.MkdirAll(kbDir, 0o755); err != nil {
		h.logger.Error("create upload dir failed", "error", err, "path", kbDir)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to prepare upload directory", r.URL.Path)
		return
	}

	// Save file to disk
	destPath := filepath.Join(kbDir, header.Filename)
	dest, err := os.Create(destPath)
	if err != nil {
		h.logger.Error("create file failed", "error", err, "path", destPath)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to save uploaded file", r.URL.Path)
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		h.logger.Error("write file failed", "error", err, "path", destPath)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to write uploaded file", r.URL.Path)
		return
	}

	// Create document entry
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	doc, err := h.store.CreateDocument(r.Context(), id, header.Filename, contentType)
	if err != nil {
		h.logger.Error("create document entry failed", "error", err, "kb_id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to create document entry", r.URL.Path)
		return
	}

	h.logger.Info("document uploaded", "doc_id", doc.ID, "kb_id", id, "filename", header.Filename, "path", destPath)

	// Trigger Marée ingestion in background
	go h.triggerIngestion(id, kbDir)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"data": doc,
		"meta": map[string]string{
			"upload_path": destPath,
			"message":     "File uploaded. Ingestion started.",
		},
	})
}

// triggerIngestion runs `maree ingest` as a subprocess.
func (h *Handler) triggerIngestion(kbID, sourcePath string) {
	dsn := h.store.DSN()
	args := []string{
		"ingest",
		"--source", sourcePath,
		"--store-url", dsn,
		"--kb-id", kbID,
		"--model", "nomic-embed-text",
	}
	h.logger.Info("triggering maree ingestion", "kb_id", kbID, "source", sourcePath)

	// Try maree from PATH, then from known venv locations
	mareeBin := "maree"
	for _, candidate := range []string{
		"/Users/adham/Projects/agentic-platform-opensource/maree/.venv/bin/maree",
		"/usr/local/bin/maree",
	} {
		if _, err := os.Stat(candidate); err == nil {
			mareeBin = candidate
			break
		}
	}
	cmd := exec.Command(mareeBin, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		h.logger.Error("maree ingestion failed", "error", err, "output", string(output), "kb_id", kbID)
		return
	}
	h.logger.Info("maree ingestion complete", "kb_id", kbID, "output", string(output))
}

// Search handles POST /api/v1/knowledge-bases/{id}/search.
// Embeds the query via Ollama and performs pgvector similarity search.
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")

	// Verify KB exists
	kb, err := h.store.Get(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", "Knowledge base not found", r.URL.Path)
		return
	}
	if err != nil {
		h.logger.Error("get knowledge base failed", "error", err, "id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to get knowledge base", r.URL.Path)
		return
	}

	var req SearchParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Request body is not valid JSON", r.URL.Path)
		return
	}

	if err := validate.Struct(req); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Validation Error", formatValidationErrors(err), r.URL.Path)
		return
	}

	topK := req.TopK
	if topK == 0 {
		topK = 5
	}

	// Embed query via Ollama
	embedding, err := embedText(r.Context(), kb.EmbeddingModel, req.Query)
	if err != nil {
		h.logger.Error("embed query failed", "error", err, "model", kb.EmbeddingModel)
		httputil.WriteError(w, http.StatusBadGateway, "Embedding Error", "Failed to generate query embedding via Ollama", r.URL.Path)
		return
	}

	results, err := h.store.SearchChunks(r.Context(), id, embedding, topK)
	if err != nil {
		h.logger.Error("search chunks failed", "error", err, "kb_id", id)
		httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to search knowledge base", r.URL.Path)
		return
	}

	if results == nil {
		results = []SearchResult{}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": results})
}

// formatValidationErrors converts validator errors to a readable string.
func formatValidationErrors(err error) string {
	ve, ok := err.(validator.ValidationErrors) //nolint:errorlint // validator returns concrete type
	if !ok {
		return err.Error()
	}
	msg := ""
	for i, fe := range ve {
		if i > 0 {
			msg += "; "
		}
		msg += fmt.Sprintf("%s: %s", fe.Field(), fe.Tag())
	}
	return msg
}

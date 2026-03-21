package kb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

const (
	uploadDir             = "/tmp/maree-uploads"
	maxUploadBytes        = 100 << 20 // 100 MB
	maxIngestionErrLen    = 1000      // truncate maree stderr before persisting
	defaultEmbeddingModel = "nomic-embed-text"
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

// Delete handles DELETE /api/v1/knowledge-bases/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.store.Delete(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "Knowledge base", "delete knowledge base failed", id)
		return
	}

	// File cleanup is best-effort: the DB state is already consistent, so a
	// failed RemoveAll just leaves orphaned bytes on disk for GC later.
	if err := os.RemoveAll(filepath.Join(uploadDir, id)); err != nil {
		h.logger.Warn("failed to remove upload dir for deleted KB", "error", err, "kb_id", id)
	}

	w.WriteHeader(http.StatusNoContent)
}

// DeleteDocument handles DELETE /api/v1/knowledge-bases/{id}/documents/{docId}.
func (h *Handler) DeleteDocument(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	kbID := chi.URLParam(r, "id")
	docID := chi.URLParam(r, "docId")

	filename, err := h.store.DeleteDocument(r.Context(), kbID, docID)
	if err != nil {
		h.writeStoreError(w, r, err, "Document", "delete document failed", docID)
		return
	}

	if filename != "" {
		if ferr := os.Remove(filepath.Join(uploadDir, kbID, filename)); ferr != nil && !os.IsNotExist(ferr) {
			h.logger.Warn("failed to remove uploaded file for deleted document", "error", ferr, "doc_id", docID)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// writeStoreError maps a store error to a JSON HTTP response. ErrNotFound
// becomes 404 with a resource-aware message; anything else is logged and
// returned as a generic 500. resource should be capitalised ("Document",
// "Knowledge base") because it's surfaced directly in the error message.
func (h *Handler) writeStoreError(w http.ResponseWriter, r *http.Request, err error, resource, logMsg, id string) {
	if errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "Not Found", resource+" not found", r.URL.Path)
		return
	}
	h.logger.Error(logMsg, "error", err, "id", id)
	httputil.WriteError(w, http.StatusInternalServerError, "Internal Error", "Failed to delete "+strings.ToLower(resource), r.URL.Path)
}

// Ingest handles POST /api/v1/knowledge-bases/{id}/ingest.
// Accepts a multipart file upload, saves it to disk, and creates a pending document entry.
func (h *Handler) Ingest(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}

	id := chi.URLParam(r, "id")

	// Verify KB exists and capture its embedding model for the ingestion call.
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

	// Trigger Marée ingestion in background. We pass:
	//   - the specific file path (not the KB directory) so Marée processes
	//     only what was just uploaded, avoiding re-ingesting leftovers
	//   - the doc.ID we just created via --document-id so Marée updates
	//     the existing kb_documents row instead of creating a parallel one
	//   - the KB's embedding model so vectors match the retrieval path
	go h.triggerIngestion(id, doc.ID, destPath, kb.EmbeddingModel)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"data": doc,
		"meta": map[string]string{
			"upload_path": destPath,
			"message":     "File uploaded. Ingestion started.",
		},
	})
}

// resolveMareeBin finds the maree binary: MAREE_BIN env var, then $PATH lookup.
func resolveMareeBin() string {
	if v := os.Getenv("MAREE_BIN"); v != "" {
		return v
	}
	if path, err := exec.LookPath("maree"); err == nil {
		return path
	}
	return "maree" // fallback — will fail with a clear error if not found
}

// triggerIngestion runs `maree ingest` as a subprocess with error tracking.
func (h *Handler) triggerIngestion(kbID, docID, sourcePath, embeddingModel string) {
	// Flip pending docs to processing so the dashboard spinner kicks in immediately.
	if err := h.store.MarkDocumentsProcessing(context.Background(), kbID); err != nil {
		h.logger.Error("failed to mark documents as processing", "error", err, "kb_id", kbID)
	}

	if embeddingModel == "" {
		embeddingModel = defaultEmbeddingModel
	}

	dsn := h.store.DSN()
	args := []string{
		"ingest",
		"--source", sourcePath,
		"--store-url", dsn,
		"--kb-id", kbID,
		"--document-id", docID,
		"--model", embeddingModel,
	}
	h.logger.Info("triggering maree ingestion", "kb_id", kbID, "source", sourcePath)

	mareeBin := resolveMareeBin()
	cmd := exec.Command(mareeBin, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		// Truncate so multi-megabyte tracebacks don't bloat the response
		if len(errMsg) > maxIngestionErrLen {
			errMsg = errMsg[:maxIngestionErrLen] + "… (truncated)"
		}
		h.logger.Error("maree ingestion failed", "error", err, "stderr", errMsg, "kb_id", kbID)

		// Mark all pending/processing documents for this KB as error
		h.markDocumentsError(kbID, errMsg)
		return
	}

	h.logger.Info("maree ingestion complete", "kb_id", kbID, "output", stdout.String())
}

// markDocumentsError updates all pending/processing documents in a KB to error status.
func (h *Handler) markDocumentsError(kbID, errMsg string) {
	if err := h.store.MarkDocumentsError(context.Background(), kbID, errMsg); err != nil {
		h.logger.Error("failed to mark documents as error", "error", err, "kb_id", kbID)
	}
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

	results, err := h.store.HybridSearch(r.Context(), id, embedding, req.Query, topK)
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

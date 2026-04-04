package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	controlv1 "github.com/sciences44/recif/gen/control/v1"
	"github.com/sciences44/recif/internal/httputil"
)

// GrpcProxyHandler proxies HTTP requests from the dashboard to Corail agents
// over gRPC.  Each agent gets its own gRPC connection, lazily created and
// cached.
type GrpcProxyHandler struct {
	logger  *slog.Logger
	baseURL string // template with %s for agent slug, port is the gRPC port

	mu    sync.RWMutex
	conns map[string]*grpc.ClientConn
}

// NewGrpcProxyHandler creates a gRPC proxy.
// grpcBaseURL uses %s for agent slug and should target the gRPC port (9001).
// Example: "%s.team-default.svc.cluster.local:9001"
func NewGrpcProxyHandler(logger *slog.Logger, grpcBaseURL string) *GrpcProxyHandler {
	if grpcBaseURL == "" {
		grpcBaseURL = "%s.team-default.svc.cluster.local:9001"
	}
	return &GrpcProxyHandler{
		logger:  logger,
		baseURL: grpcBaseURL,
		conns:   make(map[string]*grpc.ClientConn),
	}
}

// Close closes all cached gRPC connections.
func (h *GrpcProxyHandler) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for slug, conn := range h.conns {
		if err := conn.Close(); err != nil {
			h.logger.Warn("close grpc conn", "agent", slug, "error", err)
		}
	}
	h.conns = make(map[string]*grpc.ClientConn)
}

// client returns a ControlServiceClient for the given agent slug.
func (h *GrpcProxyHandler) client(slug string) (controlv1.ControlServiceClient, error) {
	h.mu.RLock()
	conn, ok := h.conns[slug]
	h.mu.RUnlock()
	if ok {
		return controlv1.NewControlServiceClient(conn), nil
	}

	target := h.buildTarget(slug)
	h.logger.Info("dialing gRPC", "agent", slug, "target", target)

	newConn, err := grpc.NewClient(target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", target, err)
	}

	h.mu.Lock()
	// Double-check: another goroutine may have created the connection.
	if existing, ok := h.conns[slug]; ok {
		h.mu.Unlock()
		_ = newConn.Close()
		return controlv1.NewControlServiceClient(existing), nil
	}
	h.conns[slug] = newConn
	h.mu.Unlock()

	return controlv1.NewControlServiceClient(newConn), nil
}

func (h *GrpcProxyHandler) buildTarget(slug string) string {
	if strings.Contains(h.baseURL, "%s") {
		return fmt.Sprintf(h.baseURL, slug)
	}
	return h.baseURL
}

func (h *GrpcProxyHandler) slugFromRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	slug := chi.URLParam(r, "id")
	if strings.HasPrefix(slug, "ag_") {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request",
			"Use agent slug (e.g., 'dashboard-test') not ag_ ID", r.URL.Path)
		return "", false
	}
	return slug, true
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

// Chat proxies POST /api/v1/agents/{id}/chat to the gRPC Chat RPC.
func (h *GrpcProxyHandler) Chat(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	var body struct {
		Input          string            `json:"input"`
		ConversationID string            `json:"conversation_id"`
		Options        map[string]string `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Cannot parse request body", r.URL.Path)
		return
	}

	client, err := h.client(slug)
	if err != nil {
		h.logger.Error("grpc client", "error", err, "agent", slug)
		httputil.WriteError(w, http.StatusBadGateway, "Agent Unreachable",
			fmt.Sprintf("Cannot reach agent '%s' via gRPC", slug), r.URL.Path)
		return
	}

	resp, err := client.Chat(r.Context(), &controlv1.ChatRequest{
		Input:          body.Input,
		ConversationId: body.ConversationID,
		Options:        body.Options,
	})
	if err != nil {
		h.logger.Error("grpc chat", "error", err, "agent", slug)
		httputil.WriteError(w, http.StatusBadGateway, "Agent Error",
			fmt.Sprintf("Chat RPC failed: %v", err), r.URL.Path)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"output":          resp.Output,
		"conversation_id": resp.ConversationId,
	})
}

// ChatStream proxies POST /api/v1/agents/{id}/chat/stream as SSE via gRPC server-streaming.
func (h *GrpcProxyHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	var body struct {
		Input          string            `json:"input"`
		ConversationID string            `json:"conversation_id"`
		Options        map[string]string `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Cannot parse request body", r.URL.Path)
		return
	}

	client, err := h.client(slug)
	if err != nil {
		h.logger.Error("grpc client", "error", err, "agent", slug)
		httputil.WriteError(w, http.StatusBadGateway, "Agent Unreachable",
			fmt.Sprintf("Cannot reach agent '%s' via gRPC", slug), r.URL.Path)
		return
	}

	stream, err := client.ChatStream(r.Context(), &controlv1.ChatRequest{
		Input:          body.Input,
		ConversationId: body.ConversationID,
		Options:        body.Options,
	})
	if err != nil {
		h.logger.Error("grpc chat stream", "error", err, "agent", slug)
		httputil.WriteError(w, http.StatusBadGateway, "Agent Error",
			fmt.Sprintf("ChatStream RPC failed: %v", err), r.URL.Path)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)

	for {
		event, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			h.logger.Warn("grpc stream recv", "error", err, "agent", slug)
			break
		}

		sseData := chatStreamEventToSSE(event)
		if sseData != "" {
			fmt.Fprintf(w, "data: %s\n\n", sseData)
			if canFlush {
				flusher.Flush()
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

// Conversations proxies GET /api/v1/agents/{id}/conversations.
func (h *GrpcProxyHandler) Conversations(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.ListConversations(r.Context(), &controlv1.ListConversationsRequest{})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	convos := make([]map[string]any, 0, len(resp.Conversations))
	for _, c := range resp.Conversations {
		convos = append(convos, map[string]any{
			"id":            c.Id,
			"title":         c.Title,
			"created_at":    c.CreatedAt,
			"message_count": c.MessageCount,
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"conversations": convos})
}

// ConversationDetail proxies GET /api/v1/agents/{id}/conversations/{cid}.
func (h *GrpcProxyHandler) ConversationDetail(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}
	cid := chi.URLParam(r, "cid")

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.GetConversation(r.Context(), &controlv1.GetConversationRequest{
		ConversationId: cid,
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	msgs := make([]map[string]string, 0, len(resp.Messages))
	for _, m := range resp.Messages {
		msgs = append(msgs, map[string]string{
			"role":    m.Role,
			"content": m.Content,
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"conversation_id": resp.ConversationId,
		"messages":        msgs,
	})
}

// DeleteConversation proxies DELETE /api/v1/agents/{id}/conversations/{cid}.
func (h *GrpcProxyHandler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}
	cid := chi.URLParam(r, "cid")

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.DeleteConversation(r.Context(), &controlv1.DeleteConversationRequest{
		ConversationId: cid,
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"deleted":         resp.Deleted,
		"conversation_id": cid,
	})
}

// GenerationStatus proxies GET /api/v1/agents/{id}/conversations/{cid}/status.
func (h *GrpcProxyHandler) GenerationStatus(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}
	cid := chi.URLParam(r, "cid")

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.GetGenerationStatus(r.Context(), &controlv1.GetGenerationStatusRequest{
		ConversationId: cid,
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"generating": resp.Generating,
		"partial":    resp.Partial,
	})
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

// Suggestions returns an empty list for gRPC proxy (not yet implemented in gRPC proto).
func (h *GrpcProxyHandler) Suggestions(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteJSON(w, http.StatusOK, map[string][]string{"suggestions": {}})
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

// ListMemories proxies GET /api/v1/agents/{id}/memory.
func (h *GrpcProxyHandler) ListMemories(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.ListMemories(r.Context(), &controlv1.ListMemoriesRequest{
		Limit: int32(limit),
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	memories := make([]map[string]any, 0, len(resp.Memories))
	for _, m := range resp.Memories {
		memories = append(memories, memoryEntryToJSON(m))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"memories": memories,
		"count":    resp.Count,
	})
}

// MemoryStatus proxies GET /api/v1/agents/{id}/memory/status.
func (h *GrpcProxyHandler) MemoryStatus(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.MemoryStatus(r.Context(), &controlv1.MemoryStatusRequest{})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"enabled":          resp.Enabled,
		"backend":          resp.Backend,
		"backend_label":    resp.BackendLabel,
		"persistent":       resp.Persistent,
		"search_type":      resp.SearchType,
		"search_label":     resp.SearchLabel,
		"scope":            resp.Scope,
		"scope_label":      resp.ScopeLabel,
		"storage_location": resp.StorageLocation,
		"count":            resp.Count,
	})
}

// StoreMemory proxies POST /api/v1/agents/{id}/memory.
func (h *GrpcProxyHandler) StoreMemory(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	var body struct {
		Content  string `json:"content"`
		Category string `json:"category"`
		Source   string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Cannot parse request body", r.URL.Path)
		return
	}

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.StoreMemory(r.Context(), &controlv1.StoreMemoryRequest{
		Content:  body.Content,
		Category: body.Category,
		Source:   body.Source,
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"stored": resp.Stored})
}

// SearchMemories proxies POST /api/v1/agents/{id}/memory/search.
func (h *GrpcProxyHandler) SearchMemories(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}

	var body struct {
		Query string `json:"query"`
		TopK  int    `json:"top_k"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Invalid JSON", "Cannot parse request body", r.URL.Path)
		return
	}
	if body.TopK <= 0 {
		body.TopK = 10
	}

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.SearchMemories(r.Context(), &controlv1.SearchMemoriesRequest{
		Query: body.Query,
		TopK:  int32(body.TopK),
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	memories := make([]map[string]any, 0, len(resp.Memories))
	for _, m := range resp.Memories {
		memories = append(memories, memoryEntryToJSON(m))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"memories": memories})
}

// DeleteMemory proxies DELETE /api/v1/agents/{id}/memory/{mid}.
func (h *GrpcProxyHandler) DeleteMemory(w http.ResponseWriter, r *http.Request) {
	slug, ok := h.slugFromRequest(w, r)
	if !ok {
		return
	}
	mid := chi.URLParam(r, "mid")

	client, err := h.client(slug)
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	resp, err := client.DeleteMemory(r.Context(), &controlv1.DeleteMemoryRequest{
		EntryId: mid,
	})
	if err != nil {
		h.grpcError(w, r, slug, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"deleted": resp.Deleted,
		"id":      mid,
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *GrpcProxyHandler) grpcError(w http.ResponseWriter, r *http.Request, slug string, err error) {
	h.logger.Error("grpc call failed", "error", err, "agent", slug)
	httputil.WriteError(w, http.StatusBadGateway, "Agent Error",
		fmt.Sprintf("gRPC call to agent '%s' failed: %v", slug, err), r.URL.Path)
}

func memoryEntryToJSON(m *controlv1.MemoryEntry) map[string]any {
	return map[string]any{
		"id":        m.Id,
		"content":   m.Content,
		"category":  m.Category,
		"source":    m.Source,
		"relevance": m.Relevance,
		"timestamp": m.Timestamp,
	}
}

// chatStreamEventToSSE converts a ChatStreamEvent proto to an SSE data payload
// that matches the existing dashboard SSE format.
func chatStreamEventToSSE(event *controlv1.ChatStreamEvent) string {
	switch e := event.Event.(type) {
	case *controlv1.ChatStreamEvent_Token:
		data, _ := json.Marshal(map[string]any{"token": e.Token})
		return string(data)

	case *controlv1.ChatStreamEvent_ToolStart:
		var args any
		if e.ToolStart.ArgsJson != "" {
			_ = json.Unmarshal([]byte(e.ToolStart.ArgsJson), &args)
		}
		data, _ := json.Marshal(map[string]any{
			"type":    "tool_start",
			"tool":    e.ToolStart.Tool,
			"args":    args,
			"call_id": e.ToolStart.CallId,
		})
		return string(data)

	case *controlv1.ChatStreamEvent_ToolEnd:
		data, _ := json.Marshal(map[string]any{
			"type":    "tool_end",
			"tool":    e.ToolEnd.Tool,
			"output":  e.ToolEnd.Output,
			"success": e.ToolEnd.Success,
			"call_id": e.ToolEnd.CallId,
		})
		return string(data)

	case *controlv1.ChatStreamEvent_Component:
		var props any
		if e.Component.PropsJson != "" {
			_ = json.Unmarshal([]byte(e.Component.PropsJson), &props)
		}
		data, _ := json.Marshal(map[string]any{
			"type":      "component",
			"component": e.Component.Component,
			"props":     props,
		})
		return string(data)

	case *controlv1.ChatStreamEvent_Plan:
		data, _ := json.Marshal(map[string]any{
			"type": "plan",
			"plan": json.RawMessage(mustMarshal(map[string]any{
				"goal":   e.Plan.PlanGoal,
				"step":   e.Plan.StepDescription,
				"status": e.Plan.StepStatus,
				"index":  e.Plan.StepIndex,
				"total":  e.Plan.TotalSteps,
			})),
		})
		return string(data)

	case *controlv1.ChatStreamEvent_Done:
		data, _ := json.Marshal(map[string]any{
			"done":            true,
			"conversation_id": e.Done.ConversationId,
		})
		return string(data)
	}

	return ""
}

func mustMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

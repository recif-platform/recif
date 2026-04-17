package agent

import (
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sciences44/recif/internal/httputil"
	"github.com/sciences44/recif/internal/server/middleware"
)

// CanaryResolver returns the canary weight (0-100) for an agent slug.
// Returns 0 if no canary is active.
type CanaryResolver interface {
	CanaryWeight(namespace, slug string) int
}

// cachedWeight stores a canary weight with a TTL to avoid K8s API calls on every request.
type cachedWeight struct {
	weight    int
	expiresAt time.Time
}

// ProxyHandler proxies chat requests to agent Pods in Kubernetes.
type ProxyHandler struct {
	logger     *slog.Logger
	baseURL    string
	canary     CanaryResolver
	httpClient *http.Client
	cacheMu    sync.RWMutex
	cache      map[string]cachedWeight
}

const canaryWeightCacheTTL = 10 * time.Second

// NewProxyHandler creates a chat proxy. agentBaseURL uses %s for agent slug.
func NewProxyHandler(logger *slog.Logger, agentBaseURL string, canary ...CanaryResolver) *ProxyHandler {
	if agentBaseURL == "" {
		agentBaseURL = "http://%s.team-default.svc.cluster.local:8000"
	}
	h := &ProxyHandler{
		logger:     logger,
		baseURL:    agentBaseURL,
		httpClient: &http.Client{Timeout: 120 * time.Second},
		cache:      make(map[string]cachedWeight),
	}
	if len(canary) > 0 {
		h.canary = canary[0]
	}
	return h
}

// resolveCanaryWeight returns the cached canary weight, refreshing from K8s if expired.
func (h *ProxyHandler) resolveCanaryWeight(namespace, slug string) int {
	if h.canary == nil {
		return 0
	}
	key := namespace + "/" + slug

	h.cacheMu.RLock()
	if c, ok := h.cache[key]; ok && time.Now().Before(c.expiresAt) {
		h.cacheMu.RUnlock()
		return c.weight
	}
	h.cacheMu.RUnlock()

	weight := h.canary.CanaryWeight(namespace, slug)

	h.cacheMu.Lock()
	h.cache[key] = cachedWeight{weight: weight, expiresAt: time.Now().Add(canaryWeightCacheTTL)}
	h.cacheMu.Unlock()
	return weight
}

// Chat proxies POST /api/v1/agents/{id}/chat to the agent Pod control plane.
func (h *ProxyHandler) Chat(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodPost, "/control/chat")
}

// ChatStream proxies POST /api/v1/agents/{id}/chat/stream as SSE.
func (h *ProxyHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodPost, "/control/chat/stream")
}

// Conversations proxies GET /api/v1/agents/{id}/conversations to the agent Pod.
func (h *ProxyHandler) Conversations(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodGet, "/control/conversations")
}

// ConversationDetail proxies GET /api/v1/agents/{id}/conversations/{cid} to the agent Pod.
func (h *ProxyHandler) ConversationDetail(w http.ResponseWriter, r *http.Request) {
	cid := chi.URLParam(r, "cid")
	h.proxyTo(w, r, http.MethodGet, "/control/conversations/"+cid)
}

// DeleteConversation proxies DELETE /api/v1/agents/{id}/conversations/{cid} to the agent Pod.
func (h *ProxyHandler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	cid := chi.URLParam(r, "cid")
	h.proxyTo(w, r, http.MethodDelete, "/control/conversations/"+cid)
}

// GenerationStatus proxies GET /api/v1/agents/{id}/conversations/{cid}/status to the agent Pod.
func (h *ProxyHandler) GenerationStatus(w http.ResponseWriter, r *http.Request) {
	cid := chi.URLParam(r, "cid")
	h.proxyTo(w, r, http.MethodGet, "/control/conversations/"+cid+"/status")
}

// ListMemories proxies GET /api/v1/agents/{id}/memory to the agent Pod.
func (h *ProxyHandler) ListMemories(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodGet, "/control/memory")
}

// MemoryStatus proxies GET /api/v1/agents/{id}/memory/status to the agent Pod.
func (h *ProxyHandler) MemoryStatus(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodGet, "/control/memory/status")
}

// StoreMemory proxies POST /api/v1/agents/{id}/memory to the agent Pod.
func (h *ProxyHandler) StoreMemory(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodPost, "/control/memory")
}

// SearchMemories proxies POST /api/v1/agents/{id}/memory/search to the agent Pod.
func (h *ProxyHandler) SearchMemories(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodPost, "/control/memory/search")
}

// DeleteMemory proxies DELETE /api/v1/agents/{id}/memory/{mid} to the agent Pod.
func (h *ProxyHandler) DeleteMemory(w http.ResponseWriter, r *http.Request) {
	mid := chi.URLParam(r, "mid")
	h.proxyTo(w, r, http.MethodDelete, "/control/memory/"+mid)
}

// Suggestions proxies GET /api/v1/agents/{id}/suggestions to the agent Pod.
func (h *ProxyHandler) Suggestions(w http.ResponseWriter, r *http.Request) {
	h.proxyTo(w, r, http.MethodGet, "/control/suggestions")
}

func (h *ProxyHandler) proxyTo(w http.ResponseWriter, r *http.Request, method string, path string) {
	agentSlug := chi.URLParam(r, "id")
	if strings.HasPrefix(agentSlug, "ag_") {
		httputil.WriteError(w, http.StatusBadRequest, "Bad Request",
			"Use agent slug (e.g., 'dashboard-test') not ag_ ID", r.URL.Path)
		return
	}

	// Route to canary: explicit query param OR probabilistic based on canary weight
	namespace := middleware.NamespaceFromContext(r.Context())
	if r.URL.Query().Get("version") == "canary" {
		agentSlug = agentSlug + "-canary"
	} else if weight := h.resolveCanaryWeight(namespace, agentSlug); weight > 0 && rand.Intn(100) < weight {
		agentSlug = agentSlug + "-canary"
	}

	targetURL := h.buildTargetURL(agentSlug, path)
	h.logger.Info("proxying", "agent", agentSlug, "target", targetURL)

	proxyReq, err := http.NewRequestWithContext(r.Context(), method, targetURL, r.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Proxy Error", "Failed to create request", r.URL.Path)
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(proxyReq)
	if err != nil {
		h.logger.Error("proxy failed", "error", err, "target", targetURL)
		httputil.WriteError(w, http.StatusBadGateway, "Agent Unreachable",
			fmt.Sprintf("Cannot reach agent '%s'", agentSlug), r.URL.Path)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	// Forward all headers (important for SSE content-type)
	for key, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}

	// For SSE: flush each chunk immediately
	flusher, canFlush := w.(http.Flusher)
	w.WriteHeader(resp.StatusCode)

	buf := make([]byte, 1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}
}

func (h *ProxyHandler) buildTargetURL(agentSlug, path string) string {
	if strings.Contains(h.baseURL, "%s") {
		return fmt.Sprintf(h.baseURL, agentSlug) + path
	}
	return h.baseURL + path
}

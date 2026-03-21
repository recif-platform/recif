package agent

import "net/http"

// ProxyHandlerI is the interface for proxying requests to Corail agents.
// Both the HTTP proxy (ProxyHandler) and gRPC proxy (GrpcProxyHandler)
// implement this interface.
type ProxyHandlerI interface {
	Chat(w http.ResponseWriter, r *http.Request)
	ChatStream(w http.ResponseWriter, r *http.Request)
	Conversations(w http.ResponseWriter, r *http.Request)
	ConversationDetail(w http.ResponseWriter, r *http.Request)
	DeleteConversation(w http.ResponseWriter, r *http.Request)
	GenerationStatus(w http.ResponseWriter, r *http.Request)
	Suggestions(w http.ResponseWriter, r *http.Request)
	ListMemories(w http.ResponseWriter, r *http.Request)
	MemoryStatus(w http.ResponseWriter, r *http.Request)
	StoreMemory(w http.ResponseWriter, r *http.Request)
	SearchMemories(w http.ResponseWriter, r *http.Request)
	DeleteMemory(w http.ResponseWriter, r *http.Request)
}

// Compile-time interface checks.
var (
	_ ProxyHandlerI = (*ProxyHandler)(nil)
	_ ProxyHandlerI = (*GrpcProxyHandler)(nil)
)

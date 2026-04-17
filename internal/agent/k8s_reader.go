package agent

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var agentGVR = schema.GroupVersionResource{
	Group:    "agents.recif.dev",
	Version:  "v1",
	Resource: "agents",
}

// K8sReader provides read-only access to K8s agent resources.
type K8sReader interface {
	Enrich(ctx context.Context, agent *Agent, namespace string) error
	EnrichAll(ctx context.Context, agents []*Agent, namespace string)
	AgentCRDExists(ctx context.Context, namespace, slug string) bool
	GetEvents(ctx context.Context, namespace, slug string) ([]K8sEvent, error)
}

// K8sClientReader implements K8sReader using the Kubernetes dynamic client.
type K8sClientReader struct {
	client dynamic.Interface
	logger *slog.Logger
}

// NewK8sClientReader creates a K8sReader. Returns nil if K8s is not available.
func NewK8sClientReader(logger *slog.Logger) *K8sClientReader {
	client := buildK8sClient(logger)
	if client == nil {
		return nil
	}
	logger.Info("K8s reader enabled")
	return &K8sClientReader{client: client, logger: logger}
}

// Enrich adds K8s CRD fields to an agent. Non-destructive: only sets fields that are empty.
func (r *K8sClientReader) Enrich(ctx context.Context, agent *Agent, namespace string) error {
	if r == nil {
		return nil
	}

	crd, err := r.findCRD(ctx, namespace, agent)
	if err != nil {
		r.logger.Info("CRD not found for agent", "agent", agent.Name, "namespace", namespace, "error", err)
		return nil
	}

	enrichFromCRD(agent, crd)
	return nil
}

// EnrichAll enriches a slice of agents using a single K8s List call.
func (r *K8sClientReader) EnrichAll(ctx context.Context, agents []*Agent, namespace string) {
	if r == nil || len(agents) == 0 {
		return
	}

	// Single List call to get all CRDs at once
	list, err := r.client.Resource(agentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		r.logger.Warn("failed to list agent CRDs for enrichment", "error", err)
		return
	}

	// Build lookup maps: by name and by spec.name
	crdByName := make(map[string]*unstructured.Unstructured, len(list.Items))
	crdBySpecName := make(map[string]*unstructured.Unstructured, len(list.Items))
	for i := range list.Items {
		item := &list.Items[i]
		crdByName[item.GetName()] = item
		if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
			if name, ok := spec["name"].(string); ok {
				crdBySpecName[name] = item
			}
		}
	}

	// Match each agent to its CRD
	for _, a := range agents {
		var crd *unstructured.Unstructured
		if c, ok := crdByName[a.Slug]; ok {
			crd = c
		} else if c, ok := crdByName[strings.ToLower(strings.ReplaceAll(a.Name, " ", "-"))]; ok {
			crd = c
		} else if c, ok := crdBySpecName[a.Name]; ok {
			crd = c
		}
		if crd == nil {
			continue
		}
		enrichFromCRD(a, crd)
	}
}

func enrichFromCRD(agent *Agent, crd *unstructured.Unstructured) {
	spec, ok := crd.Object["spec"].(map[string]interface{})
	if !ok {
		return
	}
	status, _ := crd.Object["status"].(map[string]interface{})

	agent.Channel = strField(spec, "channel")
	agent.Strategy = strField(spec, "strategy")
	agent.ModelType = strField(spec, "modelType")
	agent.ModelID = strField(spec, "modelId")
	agent.SystemPrompt = strField(spec, "systemPrompt")
	agent.Storage = strField(spec, "storage")
	agent.Image = strField(spec, "image")
	if rv, ok := spec["replicas"]; ok {
		agent.Replicas = int32(rv.(int64))
	}

	if toolsRaw, ok := spec["tools"]; ok {
		if toolsList, ok := toolsRaw.([]interface{}); ok {
			agent.Tools = make([]string, 0, len(toolsList))
			for _, t := range toolsList {
				agent.Tools = append(agent.Tools, fmt.Sprintf("%v", t))
			}
		}
	}

	if kbRaw, ok := spec["knowledgeBases"]; ok {
		if kbList, ok := kbRaw.([]interface{}); ok {
			agent.KnowledgeBases = make([]string, 0, len(kbList))
			for _, kb := range kbList {
				agent.KnowledgeBases = append(agent.KnowledgeBases, fmt.Sprintf("%v", kb))
			}
		}
	}

	if skillsRaw, ok := spec["skills"]; ok {
		if skillsList, ok := skillsRaw.([]interface{}); ok {
			agent.Skills = make([]string, 0, len(skillsList))
			for _, s := range skillsList {
				agent.Skills = append(agent.Skills, fmt.Sprintf("%v", s))
			}
		}
	}

	// Canary spec
	if weight := canaryWeightFromSpec(spec); weight > 0 {
		canaryRaw, _ := spec["canary"].(map[string]interface{})
		agent.Canary = &CanaryInfo{
			Enabled:      true,
			Weight:       weight,
			Version:      strField(canaryRaw, "version"),
			ModelType:    strField(canaryRaw, "modelType"),
			ModelID:      strField(canaryRaw, "modelId"),
			SystemPrompt: strField(canaryRaw, "systemPrompt"),
		}
	}

	if status != nil {
		agent.Endpoint = strField(status, "endpoint")
		agent.Phase = strField(status, "phase")
	}
}

// AgentCRDExists checks if an Agent CRD with the given slug exists.
func (r *K8sClientReader) AgentCRDExists(ctx context.Context, namespace, slug string) bool {
	if r == nil {
		return false
	}
	_, err := r.client.Resource(agentGVR).Namespace(namespace).Get(ctx, slug, metav1.GetOptions{})
	return err == nil
}

// GetEvents fetches the last 20 K8s events for resources related to the given agent slug.
func (r *K8sClientReader) GetEvents(ctx context.Context, namespace, slug string) ([]K8sEvent, error) {
	if r == nil {
		return nil, fmt.Errorf("k8s reader not available")
	}

	eventGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	eventList, err := r.client.Resource(eventGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}

	var matched []K8sEvent
	for _, item := range eventList.Items {
		involved, _ := item.Object["involvedObject"].(map[string]interface{})
		if involved == nil {
			continue
		}
		objName := fmt.Sprintf("%v", involved["name"])
		objKind := fmt.Sprintf("%v", involved["kind"])

		kindMatch := objKind == "Pod" || objKind == "Deployment" || objKind == "ConfigMap" || objKind == "ReplicaSet"
		if !kindMatch || !strings.Contains(objName, slug) {
			continue
		}

		ts := strField(item.Object, "lastTimestamp")
		if ts == "" {
			ts = strField(item.Object, "firstTimestamp")
		}

		parsedTime, _ := time.Parse(time.RFC3339, ts)

		count := int32(1)
		if c, ok := item.Object["count"]; ok {
			if ci, ok := c.(int64); ok {
				count = int32(ci)
			}
		}

		matched = append(matched, K8sEvent{
			Type:       strField(item.Object, "type"),
			Reason:     strField(item.Object, "reason"),
			Message:    strField(item.Object, "message"),
			ObjectKind: objKind,
			ObjectName: objName,
			Timestamp:  parsedTime,
			Count:      count,
		})
	}

	// Sort by timestamp descending (newest first)
	sort.Slice(matched, func(i, j int) bool {
		return matched[i].Timestamp.After(matched[j].Timestamp)
	})

	// Limit to 20 events
	if len(matched) > 20 {
		matched = matched[:20]
	}

	return matched, nil
}

// CanaryWeight returns the canary traffic weight (0-100) for an agent by slug.
// Returns 0 if no canary is active or on any error (fail-open for availability).
func (r *K8sClientReader) CanaryWeight(namespace, slug string) int {
	if r == nil {
		return 0
	}
	if namespace == "" {
		namespace = "team-default"
	}
	crd, err := r.client.Resource(agentGVR).Namespace(namespace).Get(context.Background(), slug, metav1.GetOptions{})
	if err != nil {
		return 0
	}
	spec, _ := crd.Object["spec"].(map[string]interface{})
	return canaryWeightFromSpec(spec)
}

// canaryWeightFromSpec extracts the canary weight from a CRD spec map.
// Shared between CanaryWeight (proxy routing) and Enrich (agent enrichment).
func canaryWeightFromSpec(spec map[string]interface{}) int {
	canaryRaw, ok := spec["canary"].(map[string]interface{})
	if !ok {
		return 0
	}
	enabled, _ := canaryRaw["enabled"].(bool)
	if !enabled {
		return 0
	}
	return intField(canaryRaw, "weight")
}

// intField extracts an integer from an unstructured map, handling both int64 and float64.
func intField(m map[string]interface{}, key string) int {
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch w := v.(type) {
	case int64:
		return int(w)
	case float64:
		return int(w)
	default:
		return 0
	}
}

// findCRD tries multiple name patterns to locate the Agent CRD.
func (r *K8sClientReader) findCRD(ctx context.Context, namespace string, agent *Agent) (*unstructured.Unstructured, error) {
	nameSlug := strings.ToLower(strings.ReplaceAll(agent.Name, " ", "-"))
	candidates := []string{agent.Slug, nameSlug}

	// Also try listing all CRDs and matching by spec.name
	if list, err := r.client.Resource(agentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		for _, item := range list.Items {
			spec, _ := item.Object["spec"].(map[string]interface{})
			if spec != nil && fmt.Sprintf("%v", spec["name"]) == agent.Name {
				candidates = append([]string{item.GetName()}, candidates...)
				break
			}
		}
	}

	var lastErr error
	for _, name := range candidates {
		if name == "" {
			continue
		}
		crd, err := r.client.Resource(agentGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			return crd, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func strField(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

// buildK8sClient creates a dynamic K8s client, trying in-cluster first, then kubeconfig.
func buildK8sClient(logger *slog.Logger) dynamic.Interface {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		kubeconfig := clientcmd.NewDefaultClientConfigLoadingRules().GetDefaultFilename()
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			logger.Info("K8s client disabled -- no kubeconfig found")
			return nil
		}
	}

	client, err := dynamic.NewForConfig(cfg)
	if err != nil {
		logger.Warn("K8s client disabled", "error", err)
		return nil
	}
	return client
}

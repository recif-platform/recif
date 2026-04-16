package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

const (
	labelTeamID        = "recif.dev/team-id"
	annotationAgentID  = "recif.dev/agent-id"
	annotationCreatedBy = "recif.dev/created-by"
)

// K8sRepository implements Repository using Kubernetes Agent CRDs as the source of truth.
type K8sRepository struct {
	client    dynamic.Interface
	logger    *slog.Logger
	namespace string // default namespace for agents
}

// NewK8sRepository creates a K8sRepository. Returns nil if K8s is unavailable.
func NewK8sRepository(logger *slog.Logger, defaultNamespace string) *K8sRepository {
	client := buildK8sClient(logger)
	if client == nil {
		return nil
	}
	if defaultNamespace == "" {
		defaultNamespace = "team-default"
	}
	logger.Info("K8s repository enabled (CRDs as source of truth)", "namespace", defaultNamespace)
	return &K8sRepository{client: client, logger: logger, namespace: defaultNamespace}
}

// IsK8sBacked returns true — this repository uses CRDs as the source of truth.
func (r *K8sRepository) IsK8sBacked() bool { return true }

// Get returns an agent by slug (K8s object name). Also supports legacy ag_* IDs via annotation lookup.
func (r *K8sRepository) Get(ctx context.Context, id string) (*Agent, error) {
	// Fast path: try direct lookup by slug
	crd, err := r.client.Resource(agentGVR).Namespace(r.namespace).Get(ctx, id, metav1.GetOptions{})
	if err == nil {
		return agentFromCRD(crd), nil
	}

	// Slow path: scan for legacy ag_* ID in annotations
	if strings.HasPrefix(id, "ag_") {
		list, listErr := r.client.Resource(agentGVR).Namespace(r.namespace).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			return nil, fmt.Errorf("list agents: %w", listErr)
		}
		for i := range list.Items {
			if list.Items[i].GetAnnotations()[annotationAgentID] == id {
				return agentFromCRD(&list.Items[i]), nil
			}
		}
	}

	return nil, ErrNotFound
}

// GetBySlug returns an agent by team namespace and slug.
func (r *K8sRepository) GetBySlug(ctx context.Context, teamID, slug string) (*Agent, error) {
	ns := r.namespaceForTeam(teamID)
	crd, err := r.client.Resource(agentGVR).Namespace(ns).Get(ctx, slug, metav1.GetOptions{})
	if err != nil {
		return nil, ErrNotFound
	}
	return agentFromCRD(crd), nil
}

// ListByTeam lists agents owned by the given team, using a label selector.
func (r *K8sRepository) ListByTeam(ctx context.Context, teamID string, limit, offset int32) ([]Agent, error) {
	opts := metav1.ListOptions{}
	if teamID != "" {
		opts.LabelSelector = labelTeamID + "=" + teamID
	}
	return r.listWithOpts(ctx, r.namespace, opts, limit, offset)
}

// ListAll lists agents across the default namespace.
func (r *K8sRepository) ListAll(ctx context.Context, limit, offset int32) ([]Agent, error) {
	return r.listWithOpts(ctx, r.namespace, metav1.ListOptions{}, limit, offset)
}

func (r *K8sRepository) listWithOpts(ctx context.Context, ns string, opts metav1.ListOptions, limit, offset int32) ([]Agent, error) {
	list, err := r.client.Resource(agentGVR).Namespace(ns).List(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}

	agents := make([]Agent, 0, len(list.Items))
	for i := range list.Items {
		agents = append(agents, *agentFromCRD(&list.Items[i]))
	}

	return paginate(agents, limit, offset), nil
}

// Search filters agents by name/description substring match.
func (r *K8sRepository) Search(ctx context.Context, query string, limit, offset int32) ([]Agent, error) {
	all, err := r.ListAll(ctx, 0, 0)
	if err != nil {
		return nil, err
	}

	q := strings.ToLower(query)
	var matched []Agent
	for _, a := range all {
		if strings.Contains(strings.ToLower(a.Name), q) || strings.Contains(strings.ToLower(a.Description), q) || strings.Contains(strings.ToLower(a.Slug), q) {
			matched = append(matched, a)
		}
	}

	return paginate(matched, limit, offset), nil
}

// paginate applies client-side offset/limit to a slice (K8s List doesn't support offset).
func paginate(items []Agent, limit, offset int32) []Agent {
	if int(offset) >= len(items) {
		return []Agent{}
	}
	items = items[offset:]
	if limit > 0 && int(limit) < len(items) {
		items = items[:limit]
	}
	return items
}

// Create creates a new Agent CRD.
func (r *K8sRepository) Create(ctx context.Context, params CreateParams) (*Agent, error) {
	slug := params.Slug
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(params.Name, " ", "-"))
	}

	// Build spec from config JSONB (for backward compat with the existing CreateParams)
	spec := map[string]interface{}{
		"name":      params.Name,
		"framework": params.Framework,
	}

	if params.Description != "" {
		spec["description"] = params.Description
	}
	if params.Version != "" {
		spec["version"] = params.Version
	}

	// Merge fields from Config JSONB if present
	if len(params.Config) > 0 {
		var cfg map[string]interface{}
		if err := json.Unmarshal(params.Config, &cfg); err == nil {
			for dbKey, crdKey := range DBToCRDKeyMap {
				if v, ok := cfg[dbKey]; ok {
					if s, isStr := v.(string); isStr && s == "" {
						continue // skip empty strings (K8s enum validation)
					}
					spec[crdKey] = v
				}
			}
		}
	}

	// Set defaults
	if spec["strategy"] == nil {
		spec["strategy"] = "agent-react"
	}
	if spec["channel"] == nil {
		spec["channel"] = "rest"
	}
	if spec["image"] == nil {
		spec["image"] = "ghcr.io/recif-platform/corail:latest"
	}
	spec["replicas"] = int64(1)

	annotations := map[string]interface{}{}
	if params.ID != "" {
		annotations[annotationAgentID] = params.ID
	}
	if params.TeamID != "" {
		annotations[labelTeamID] = params.TeamID
	}
	if params.CreatedBy != "" {
		annotations[annotationCreatedBy] = params.CreatedBy
	}

	labels := map[string]interface{}{}
	if params.TeamID != "" {
		labels[labelTeamID] = params.TeamID
	}

	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "agents.recif.dev/v1",
			"kind":       "Agent",
			"metadata": map[string]interface{}{
				"name":        slug,
				"namespace":   r.namespace,
				"annotations": annotations,
				"labels":      labels,
			},
			"spec": spec,
		},
	}

	created, err := r.client.Resource(agentGVR).Namespace(r.namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("create agent CRD: %w", err)
	}

	r.logger.Info("Agent CRD created", "slug", slug)
	return agentFromCRD(created), nil
}

// Update patches the Agent CRD spec.
func (r *K8sRepository) Update(ctx context.Context, a *Agent) (*Agent, error) {
	slug := a.Slug
	if slug == "" {
		slug = a.ID
	}

	spec := map[string]interface{}{
		"name":      a.Name,
		"framework": a.Framework,
	}
	if a.Description != "" {
		spec["description"] = a.Description
	}
	if a.Version != "" {
		spec["version"] = a.Version
	}

	patchBytes, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return nil, fmt.Errorf("marshal patch: %w", err)
	}

	patched, err := r.client.Resource(agentGVR).Namespace(r.namespace).Patch(
		ctx, slug, types.MergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("update agent CRD: %w", err)
	}

	return agentFromCRD(patched), nil
}

// Delete removes an Agent CRD by slug.
func (r *K8sRepository) Delete(ctx context.Context, id string) error {
	// Resolve id to slug
	agent, err := r.Get(ctx, id)
	if err != nil {
		return err
	}

	if err := r.client.Resource(agentGVR).Namespace(r.namespace).Delete(ctx, agent.Slug, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("delete agent CRD: %w", err)
	}

	r.logger.Info("Agent CRD deleted", "slug", agent.Slug)
	return nil
}

// UpdateConfig patches specific spec fields on the Agent CRD.
func (r *K8sRepository) UpdateConfig(ctx context.Context, id string, updates map[string]any) error {
	agent, err := r.Get(ctx, id)
	if err != nil {
		return err
	}

	specPatch := make(map[string]interface{})

	// Accept both DB-style (snake_case) and CRD-style (camelCase) keys
	for dbKey, crdKey := range DBToCRDKeyMap {
		for _, key := range []string{dbKey, crdKey} {
			if v, ok := updates[key]; ok {
				if s, isStr := v.(string); isStr && s == "" {
					continue // skip empty strings (K8s enum validation)
				}
				specPatch[crdKey] = v
			}
		}
	}

	if len(specPatch) == 0 {
		return nil
	}

	patchBytes, err := json.Marshal(map[string]interface{}{"spec": specPatch})
	if err != nil {
		return fmt.Errorf("marshal config patch: %w", err)
	}

	_, err = r.client.Resource(agentGVR).Namespace(r.namespace).Patch(
		ctx, agent.Slug, types.MergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patch agent config: %w", err)
	}

	return nil
}

// CreateVersion is a no-op — version history is managed by the release/git-state system.
func (r *K8sRepository) CreateVersion(_ context.Context, v AgentVersion) (*AgentVersion, error) {
	v.CreatedAt = time.Now()
	return &v, nil
}

// ListVersions returns an empty list — version history is in the git-state repo.
func (r *K8sRepository) ListVersions(_ context.Context, _ string) ([]AgentVersion, error) {
	return []AgentVersion{}, nil
}

// namespaceForTeam maps a team ID to a K8s namespace.
func (r *K8sRepository) namespaceForTeam(teamID string) string {
	if teamID == "" || teamID == "tk_DEFAULT000000000000000000" {
		return r.namespace
	}
	// Convention: team namespace = "team-{slug}" derived from teamID
	return r.namespace
}

// agentFromCRD converts a K8s Agent CRD to the domain Agent model.
func agentFromCRD(crd *unstructured.Unstructured) *Agent {
	spec, _ := crd.Object["spec"].(map[string]interface{})
	status, _ := crd.Object["status"].(map[string]interface{})
	annotations := crd.GetAnnotations()

	a := &Agent{
		ID:        crd.GetName(), // slug is the canonical ID
		Slug:      crd.GetName(),
		Name:      strField(spec, "name"),
		Framework: strField(spec, "framework"),
		Status:    StatusActive,
		CreatedAt: crd.GetCreationTimestamp().Time,
		UpdatedAt: crd.GetCreationTimestamp().Time,
	}

	// Override ID with legacy annotation if present
	if legacyID, ok := annotations[annotationAgentID]; ok && legacyID != "" {
		a.ID = legacyID
	}
	if teamID, ok := annotations[labelTeamID]; ok {
		a.TeamID = teamID
	}
	if createdBy, ok := annotations[annotationCreatedBy]; ok {
		a.CreatedBy = createdBy
	}

	// Spec fields
	a.Description = strField(spec, "description")
	a.Version = strField(spec, "version")
	a.Channel = strField(spec, "channel")
	a.Strategy = strField(spec, "strategy")
	a.ModelType = strField(spec, "modelType")
	a.ModelID = strField(spec, "modelId")
	a.Storage = strField(spec, "storage")
	a.Image = strField(spec, "image")
	if rv, ok := spec["replicas"]; ok {
		if ri, ok := rv.(int64); ok {
			a.Replicas = int32(ri)
		}
	}

	a.Tools = strSlice(spec, "tools")
	a.KnowledgeBases = strSlice(spec, "knowledgeBases")
	a.Skills = strSlice(spec, "skills")

	// Status fields
	if status != nil {
		a.Endpoint = strField(status, "endpoint")
		a.Phase = strField(status, "phase")
	}

	// Build config JSONB for backward compat (dashboard reads it)
	cfg := map[string]interface{}{
		"model_type": a.ModelType,
		"model_id":   a.ModelID,
		"strategy":   a.Strategy,
		"channel":    a.Channel,
		"storage":    a.Storage,
		"image":      a.Image,
	}
	if len(a.Tools) > 0 {
		cfg["tools"] = a.Tools
	}
	if len(a.Skills) > 0 {
		cfg["skills"] = a.Skills
	}
	if sp := strField(spec, "systemPrompt"); sp != "" {
		cfg["system_prompt"] = sp
	}
	a.Config, _ = json.Marshal(cfg)

	return a
}

// strSlice extracts a []string from an unstructured field.
func strSlice(m map[string]interface{}, key string) []string {
	raw, ok := m[key]
	if !ok {
		return nil
	}
	list, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, v := range list {
		out = append(out, fmt.Sprintf("%v", v))
	}
	return out
}

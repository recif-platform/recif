package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

// K8sWriter provides mutating operations on K8s agent resources.
type K8sWriter interface {
	CreateAgentCRD(ctx context.Context, namespace, slug string, spec map[string]any) error
	DeleteAgentCRD(ctx context.Context, namespace, slug string) error
	PatchSpec(ctx context.Context, namespace, name string, fields map[string]any) error
	ScaleAgent(ctx context.Context, namespace, slug string, replicas int32) error
	DeleteAgentPod(ctx context.Context, namespace, slug string) error
	CreateCanaryDeployment(ctx context.Context, namespace, slug string, canarySpec map[string]any) error
	DeleteCanaryDeployment(ctx context.Context, namespace, slug string) error
	CreateService(ctx context.Context, namespace, name string, selector map[string]string, port int32) error
	DeleteService(ctx context.Context, namespace, name string) error
	AnnotateResource(ctx context.Context, namespace, resource, name string, annotations map[string]string) error
	ApplyTrafficSplit(ctx context.Context, namespace, slug string, stableWeight, canaryWeight int) error
	DeleteTrafficSplit(ctx context.Context, namespace, slug string) error
}

// K8sClientWriter implements K8sWriter using the Kubernetes dynamic client.
type K8sClientWriter struct {
	client dynamic.Interface
	logger *slog.Logger
}

// NewK8sClientWriter creates a K8sWriter. Returns nil if K8s is not available.
func NewK8sClientWriter(logger *slog.Logger) *K8sClientWriter {
	client := buildK8sClient(logger)
	if client == nil {
		return nil
	}
	logger.Info("K8s writer enabled")
	return &K8sClientWriter{client: client, logger: logger}
}

// CreateAgentCRD creates a new Agent CRD in the cluster.
func (w *K8sClientWriter) CreateAgentCRD(ctx context.Context, namespace, slug string, spec map[string]any) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "agents.recif.dev/v1",
			"kind":       "Agent",
			"metadata": map[string]interface{}{
				"name":      slug,
				"namespace": namespace,
			},
			"spec": spec,
		},
	}

	_, err := w.client.Resource(agentGVR).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("create Agent CRD: %w", err)
	}

	w.logger.Info("Agent CRD created", "name", slug, "namespace", namespace)
	return nil
}

// DeleteAgentCRD deletes an Agent CRD. The operator will clean up child resources.
func (w *K8sClientWriter) DeleteAgentCRD(ctx context.Context, namespace, slug string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}
	err := w.client.Resource(agentGVR).Namespace(namespace).Delete(ctx, slug, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("delete agent CRD: %w", err)
	}
	w.logger.Info("Agent CRD deleted", "slug", slug, "namespace", namespace)
	return nil
}

// PatchSpec updates Agent CRD spec fields by searching for the CRD by spec.name.
func (w *K8sClientWriter) PatchSpec(ctx context.Context, namespace, agentName string, fields map[string]any) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	crdName, err := w.findCRDName(ctx, namespace, agentName)
	if err != nil {
		return err
	}

	specPatch := make(map[string]interface{})
	for k, v := range fields {
		specPatch[k] = v
	}

	patchBytes, err := json.Marshal(map[string]interface{}{"spec": specPatch})
	if err != nil {
		return fmt.Errorf("marshal patch: %w", err)
	}

	_, err = w.client.Resource(agentGVR).Namespace(namespace).Patch(
		ctx, crdName, types.MergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patch CRD: %w", err)
	}

	w.logger.Info("CRD patched", "name", crdName, "namespace", namespace, "fields", fields)
	return nil
}

// ScaleAgent patches the replicas field on the Agent CRD.
func (w *K8sClientWriter) ScaleAgent(ctx context.Context, namespace, slug string, replicas int32) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	patchBytes, err := json.Marshal(map[string]interface{}{
		"spec": map[string]interface{}{
			"replicas": replicas,
		},
	})
	if err != nil {
		return fmt.Errorf("marshal scale patch: %w", err)
	}

	_, err = w.client.Resource(agentGVR).Namespace(namespace).Patch(
		ctx, slug, types.MergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("scale Agent CRD: %w", err)
	}

	w.logger.Info("Agent CRD scaled", "name", slug, "namespace", namespace, "replicas", replicas)
	return nil
}

// DeleteAgentPod deletes pods matching the agent slug label, triggering a recreate.
func (w *K8sClientWriter) DeleteAgentPod(ctx context.Context, namespace, slug string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	podGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	podList, err := w.client.Resource(podGVR).Namespace(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", slug),
	})
	if err != nil {
		return fmt.Errorf("list pods for agent %q: %w", slug, err)
	}

	for _, pod := range podList.Items {
		if delErr := w.client.Resource(podGVR).Namespace(namespace).Delete(
			ctx, pod.GetName(), metav1.DeleteOptions{},
		); delErr != nil {
			w.logger.Warn("failed to delete pod", "pod", pod.GetName(), "error", delErr)
		} else {
			w.logger.Info("Pod deleted for restart", "pod", pod.GetName(), "agent", slug)
		}
	}
	return nil
}

// GVRs for canary deployment management.
var (
	deploymentGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
)

// CreateCanaryDeployment creates a canary Deployment with its own ConfigMap.
// The canary ConfigMap is a copy of the stable ConfigMap with overrides applied.
func (w *K8sClientWriter) CreateCanaryDeployment(ctx context.Context, namespace, slug string, canarySpec map[string]any) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	canaryName := slug + "-canary"
	canaryConfigName := canaryName + "-config"
	image, _ := canarySpec["image"].(string)
	if image == "" {
		image = "ghcr.io/recif-platform/corail:latest"
	}

	// 1. Copy stable ConfigMap and apply overrides
	if err := w.createCanaryConfigMap(ctx, namespace, slug, canarySpec); err != nil {
		w.logger.Warn("failed to create canary configmap, canary will use env vars only", "error", err)
	}

	replicas := int64(1)

	// Copy volumes, volumeMounts, env, and envFrom from stable deployment (secrets like discord-bot)
	var volumes, volumeMounts, stableEnv, stableEnvFrom []interface{}
	stableDep, err := w.client.Resource(deploymentGVR).Namespace(namespace).Get(ctx, slug, metav1.GetOptions{})
	if err == nil {
		volumes, _, _ = unstructured.NestedSlice(stableDep.Object, "spec", "template", "spec", "volumes")
		containers, _, _ := unstructured.NestedSlice(stableDep.Object, "spec", "template", "spec", "containers")
		if len(containers) > 0 {
			if c, ok := containers[0].(map[string]interface{}); ok {
				if mounts, ok := c["volumeMounts"].([]interface{}); ok {
					volumeMounts = mounts
				}
				if envList, ok := c["env"].([]interface{}); ok {
					stableEnv = envList
				}
				if envFromList, ok := c["envFrom"].([]interface{}); ok {
					stableEnvFrom = envFromList
				}
			}
		}
	}

	// Build envFrom: canary ConfigMap + all stable envFrom (secrets)
	envFrom := []interface{}{
		map[string]interface{}{
			"configMapRef": map[string]interface{}{
				"name": canaryConfigName,
			},
		},
	}
	envFrom = append(envFrom, stableEnvFrom...)

	// Build container spec
	container := map[string]interface{}{
		"name":            slug,
		"image":           image,
		"imagePullPolicy": "Always",
		"ports": []interface{}{
			map[string]interface{}{"containerPort": int64(8000), "name": "http"},
			map[string]interface{}{"containerPort": int64(8001), "name": "http-control"},
		},
		"envFrom": envFrom,
	}
	if len(volumeMounts) > 0 {
		container["volumeMounts"] = volumeMounts
	}
	if len(stableEnv) > 0 {
		container["env"] = stableEnv
	}

	// Build pod spec
	podSpec := map[string]interface{}{
		"containers": []interface{}{container},
	}
	if len(volumes) > 0 {
		podSpec["volumes"] = volumes
	}

	deployment := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      canaryName,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"app":     slug,
					"version": "canary",
				},
			},
			"spec": map[string]interface{}{
				"replicas": replicas,
				"selector": map[string]interface{}{
					"matchLabels": map[string]interface{}{
						"app":     slug,
						"version": "canary",
					},
				},
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"labels": map[string]interface{}{
							"app":     slug,
							"version": "canary",
						},
						"annotations": map[string]interface{}{
							"sidecar.istio.io/inject":                      "true",
							"traffic.sidecar.istio.io/excludeOutboundPorts": "5432",
						},
					},
					"spec": podSpec,
				},
			},
		},
	}

	if _, err = w.client.Resource(deploymentGVR).Namespace(namespace).Create(ctx, deployment, metav1.CreateOptions{}); err != nil {
		return fmt.Errorf("create canary deployment: %w", err)
	}

	w.logger.Info("Canary deployment created", "name", canaryName, "namespace", namespace)
	return nil
}

// createCanaryConfigMap copies the stable ConfigMap and applies canary overrides.
func (w *K8sClientWriter) createCanaryConfigMap(ctx context.Context, namespace, slug string, overrides map[string]any) error {
	configMapGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	stableConfigName := slug + "-config"
	canaryConfigName := slug + "-canary-config"

	// Read stable ConfigMap
	stableCM, err := w.client.Resource(configMapGVR).Namespace(namespace).Get(ctx, stableConfigName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("read stable configmap: %w", err)
	}

	// Copy data
	data, _, _ := unstructured.NestedStringMap(stableCM.Object, "data")
	if data == nil {
		data = make(map[string]string)
	}

	// Apply overrides with CORAIL_ prefix
	overrideMap := map[string]string{
		"modelType":    "CORAIL_MODEL_TYPE",
		"modelId":      "CORAIL_MODEL_ID",
		"systemPrompt": "CORAIL_SYSTEM_PROMPT",
		"strategy":     "CORAIL_STRATEGY",
		"channel":      "CORAIL_CHANNEL",
		"storage":      "CORAIL_STORAGE",
	}
	for specKey, envKey := range overrideMap {
		if v, ok := overrides[specKey].(string); ok && v != "" {
			data[envKey] = v
		}
	}

	// Handle skills/tools arrays
	if skills, ok := overrides["skills"].([]interface{}); ok {
		b, _ := json.Marshal(skills)
		data["CORAIL_SKILLS"] = string(b)
	}
	if tools, ok := overrides["tools"].([]interface{}); ok {
		b, _ := json.Marshal(tools)
		data["CORAIL_TOOLS"] = string(b)
	}

	// Convert data to map[string]interface{} for unstructured
	dataIface := make(map[string]interface{}, len(data))
	for k, v := range data {
		dataIface[k] = v
	}

	// Create or update canary ConfigMap
	cm := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ConfigMap",
			"metadata": map[string]interface{}{
				"name":      canaryConfigName,
				"namespace": namespace,
			},
			"data": dataIface,
		},
	}

	// Try update first, create if not exists
	_, err = w.client.Resource(configMapGVR).Namespace(namespace).Get(ctx, canaryConfigName, metav1.GetOptions{})
	if err != nil {
		_, err = w.client.Resource(configMapGVR).Namespace(namespace).Create(ctx, cm, metav1.CreateOptions{})
	} else {
		_, err = w.client.Resource(configMapGVR).Namespace(namespace).Update(ctx, cm, metav1.UpdateOptions{})
	}
	if err != nil {
		return fmt.Errorf("create canary configmap: %w", err)
	}

	w.logger.Info("Canary ConfigMap created", "name", canaryConfigName, "overrides", len(overrides))
	return nil
}

// DeleteCanaryDeployment deletes the {slug}-canary Deployment and its ConfigMap.
func (w *K8sClientWriter) DeleteCanaryDeployment(ctx context.Context, namespace, slug string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	canaryName := slug + "-canary"
	err := w.client.Resource(deploymentGVR).Namespace(namespace).Delete(ctx, canaryName, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("delete canary deployment: %w", err)
	}

	w.logger.Info("Canary deployment deleted", "name", canaryName, "namespace", namespace)

	// Also clean up canary ConfigMap
	configMapGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	_ = w.client.Resource(configMapGVR).Namespace(namespace).Delete(ctx, canaryName+"-config", metav1.DeleteOptions{})

	// Also clean up canary Service
	serviceGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	_ = w.client.Resource(serviceGVR).Namespace(namespace).Delete(ctx, canaryName, metav1.DeleteOptions{})

	return nil
}

// CreateService creates a K8s Service with the given name, selector, and port.
func (w *K8sClientWriter) CreateService(ctx context.Context, namespace, name string, selector map[string]string, port int32) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	serviceGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}

	selectorIface := make(map[string]interface{}, len(selector))
	for k, v := range selector {
		selectorIface[k] = v
	}

	svc := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Service",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"selector": selectorIface,
				"ports": []interface{}{
					map[string]interface{}{
						"port":       int64(port),
						"targetPort": int64(port),
						"name":       "http",
					},
				},
			},
		},
	}

	_, err := w.client.Resource(serviceGVR).Namespace(namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("create service %q: %w", name, err)
	}

	w.logger.Info("Service created", "name", name, "namespace", namespace)
	return nil
}

// DeleteService deletes a K8s Service by name.
func (w *K8sClientWriter) DeleteService(ctx context.Context, namespace, name string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}

	serviceGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	if err := w.client.Resource(serviceGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("delete service %q: %w", name, err)
	}

	w.logger.Info("Service deleted", "name", name, "namespace", namespace)
	return nil
}

// AnnotateResource patches annotations on any namespaced resource (used to trigger ArgoCD refresh).
func (w *K8sClientWriter) AnnotateResource(ctx context.Context, namespace, resource, name string, annotations map[string]string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}
	gvr := schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: resource}
	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"annotations": annotations,
		},
	}
	patchBytes, _ := json.Marshal(patch)
	_, err := w.client.Resource(gvr).Namespace(namespace).Patch(ctx, name, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	return err
}

// findCRDName finds the CRD object name by matching the K8s object name or spec.name
// to the given agentName (case-insensitive).
func (w *K8sClientWriter) findCRDName(ctx context.Context, namespace, agentName string) (string, error) {
	target := strings.ToLower(agentName)

	// Fast path: try direct lookup by object name (slug)
	_, err := w.client.Resource(agentGVR).Namespace(namespace).Get(ctx, target, metav1.GetOptions{})
	if err == nil {
		return target, nil
	}

	// Slow path: scan all CRDs and match by spec.name (case-insensitive)
	list, err := w.client.Resource(agentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("list CRDs: %w", err)
	}
	for _, item := range list.Items {
		spec, _ := item.Object["spec"].(map[string]interface{})
		if spec != nil && strings.EqualFold(fmt.Sprintf("%v", spec["name"]), agentName) {
			return item.GetName(), nil
		}
	}
	return "", fmt.Errorf("CRD not found for agent %q", agentName)
}

var istioGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "virtualservices"}
var drGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "destinationrules"}

// ApplyTrafficSplit creates or updates Istio VirtualService + DestinationRule for canary traffic splitting.
func (w *K8sClientWriter) ApplyTrafficSplit(ctx context.Context, namespace, slug string, stableWeight, canaryWeight int) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}
	host := fmt.Sprintf("%s.%s.svc.cluster.local", slug, namespace)

	// DestinationRule — connectionPool settings for SSE streaming
	dr := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "networking.istio.io/v1",
		"kind":       "DestinationRule",
		"metadata":   map[string]interface{}{"name": slug, "namespace": namespace},
		"spec": map[string]interface{}{
			"host": host,
			"trafficPolicy": map[string]interface{}{
				"connectionPool": map[string]interface{}{
					"http": map[string]interface{}{
						"h2UpgradePolicy":      "UPGRADE",
						"idleTimeout":          "300s",
						"maxRequestsPerConnection": int64(0),
					},
				},
			},
			"subsets": []interface{}{
				map[string]interface{}{"name": "stable", "labels": map[string]interface{}{"version": "stable"}},
				map[string]interface{}{"name": "canary", "labels": map[string]interface{}{"version": "canary"}},
			},
		},
	}}
	existing, err := w.client.Resource(drGVR).Namespace(namespace).Get(ctx, slug, metav1.GetOptions{})
	if err != nil {
		_, err = w.client.Resource(drGVR).Namespace(namespace).Create(ctx, dr, metav1.CreateOptions{})
	} else {
		dr.SetResourceVersion(existing.GetResourceVersion())
		_, err = w.client.Resource(drGVR).Namespace(namespace).Update(ctx, dr, metav1.UpdateOptions{})
	}
	if err != nil {
		return fmt.Errorf("apply DestinationRule: %w", err)
	}

	// VirtualService
	vs := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "networking.istio.io/v1",
		"kind":       "VirtualService",
		"metadata":   map[string]interface{}{"name": slug, "namespace": namespace},
		"spec": map[string]interface{}{
			"hosts": []interface{}{host},
			"http": []interface{}{
				map[string]interface{}{
					"timeout": "300s",
					"route": []interface{}{
						map[string]interface{}{
							"destination": map[string]interface{}{"host": host, "subset": "stable"},
							"weight":      int64(stableWeight),
						},
						map[string]interface{}{
							"destination": map[string]interface{}{"host": host, "subset": "canary"},
							"weight":      int64(canaryWeight),
						},
					},
				},
			},
		},
	}}
	existingVS, err := w.client.Resource(istioGVR).Namespace(namespace).Get(ctx, slug, metav1.GetOptions{})
	if err != nil {
		_, err = w.client.Resource(istioGVR).Namespace(namespace).Create(ctx, vs, metav1.CreateOptions{})
	} else {
		vs.SetResourceVersion(existingVS.GetResourceVersion())
		_, err = w.client.Resource(istioGVR).Namespace(namespace).Update(ctx, vs, metav1.UpdateOptions{})
	}
	if err != nil {
		return fmt.Errorf("apply VirtualService: %w", err)
	}

	w.logger.Info("Traffic split applied", "slug", slug, "stable", stableWeight, "canary", canaryWeight)
	return nil
}

// DeleteTrafficSplit removes the Istio VirtualService + DestinationRule.
func (w *K8sClientWriter) DeleteTrafficSplit(ctx context.Context, namespace, slug string) error {
	if w == nil {
		return fmt.Errorf("k8s writer not available")
	}
	_ = w.client.Resource(istioGVR).Namespace(namespace).Delete(ctx, slug, metav1.DeleteOptions{})
	_ = w.client.Resource(drGVR).Namespace(namespace).Delete(ctx, slug, metav1.DeleteOptions{})
	w.logger.Info("Traffic split deleted", "slug", slug)
	return nil
}

package cli

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/tools/clientcmd"
)

var deployFile string
var deployNamespace string

var deployCmd = &cobra.Command{
	Use:   "deploy [agent-name]",
	Short: "Deploy an agent to Kubernetes as a Pod",
	Long:  "Creates an Agent CRD in the cluster. The Récif operator reconciles it into a Deployment + Service.",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		// Read agent.yaml
		yamlPath := deployFile
		data, err := os.ReadFile(yamlPath) //nolint:gosec
		if err != nil {
			return fmt.Errorf("cannot read %s: %w", yamlPath, err)
		}

		agent, err := ValidateAgentYAML(data)
		if err != nil {
			return fmt.Errorf("invalid agent.yaml:\n%w", err)
		}

		agentName := strings.ToLower(strings.ReplaceAll(agent.Name, " ", "-"))
		if len(args) > 0 {
			agentName = args[0]
		}

		// Build K8s client
		kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			clientcmd.NewDefaultClientConfigLoadingRules(),
			&clientcmd.ConfigOverrides{},
		)
		config, err := kubeconfig.ClientConfig()
		if err != nil {
			return fmt.Errorf("cannot load kubeconfig: %w", err)
		}

		dynClient, err := dynamic.NewForConfig(config)
		if err != nil {
			return fmt.Errorf("cannot create K8s client: %w", err)
		}

		// Build Agent CR
		agentCR := &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "agents.recif.dev/v1",
				"kind":       "Agent",
				"metadata": map[string]interface{}{
					"name":      agentName,
					"namespace": deployNamespace,
				},
				"spec": map[string]interface{}{
					"name":         agent.Name,
					"framework":    agent.Framework,
					"strategy":     getStrategy(agent),
					"channel":      "rest",
					"modelType":    getModelType(agent),
					"modelId":      getModelID(agent),
					"systemPrompt": agent.SystemPrompt,
					"image":        "corail:v2",
					"replicas":     int64(1),
				},
			},
		}

		gvr := schema.GroupVersionResource{
			Group:    "agents.recif.dev",
			Version:  "v1",
			Resource: "agents",
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Check if agent already exists
		existing, err := dynClient.Resource(gvr).Namespace(deployNamespace).Get(ctx, agentName, metav1.GetOptions{})
		if err == nil {
			// Update existing
			agentCR.SetResourceVersion(existing.GetResourceVersion())
			_, err = dynClient.Resource(gvr).Namespace(deployNamespace).Update(ctx, agentCR, metav1.UpdateOptions{})
			if err != nil {
				return fmt.Errorf("update agent: %w", err)
			}
			fmt.Printf("Agent updated in Kubernetes!\n")
		} else {
			// Create new
			_, err = dynClient.Resource(gvr).Namespace(deployNamespace).Create(ctx, agentCR, metav1.CreateOptions{})
			if err != nil {
				return fmt.Errorf("create agent: %w", err)
			}
			fmt.Printf("Agent deployed to Kubernetes!\n")
		}

		fmt.Printf("  Name:      %s\n", agentName)
		fmt.Printf("  Namespace: %s\n", deployNamespace)
		fmt.Printf("  Framework: %s\n", agent.Framework)
		fmt.Printf("\n")
		fmt.Printf("Check status:\n")
		fmt.Printf("  kubectl get agents -n %s\n", deployNamespace)
		fmt.Printf("  recif status %s\n", agentName)

		return nil
	},
}

func init() {
	deployCmd.Flags().StringVarP(&deployFile, "file", "f", "agent.yaml", "Path to agent YAML file")
	deployCmd.Flags().StringVarP(&deployNamespace, "namespace", "n", "team-default", "K8s namespace to deploy to")
}

func getStrategy(a *AgentYAML) string {
	if a.Config != nil {
		if s, ok := a.Config["strategy"]; ok {
			return fmt.Sprintf("%v", s)
		}
	}
	return "simple"
}

func getModelType(a *AgentYAML) string {
	if a.LLMProvider != "" {
		return a.LLMProvider
	}
	return "stub"
}

func getModelID(a *AgentYAML) string {
	if a.Model != "" {
		return a.Model
	}
	return "stub-echo"
}


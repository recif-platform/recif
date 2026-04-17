package agent

import "encoding/json"

// DBToCRDKeyMap is the single canonical mapping from DB snake_case to CRD camelCase.
// Used by K8sRepository, config handlers, and MapRequestToDB.
var DBToCRDKeyMap = map[string]string{
	"model_type":           "modelType",
	"model_id":             "modelId",
	"system_prompt":        "systemPrompt",
	"strategy":             "strategy",
	"channel":              "channel",
	"storage":              "storage",
	"image":                "image",
	"replicas":             "replicas",
	"tools":                "tools",
	"skills":               "skills",
	"knowledge_bases":      "knowledgeBases",
	"env_secrets":          "envSecrets",
	"suggestions_provider": "suggestionsProvider",
	"suggestions":          "suggestions",
	"eval_sample_rate":     "evalSampleRate",
	"judge_model":          "judgeModel",
	"prompt_ref":           "promptRef",
}

// crdToDBKeyMap is the inverse of DBToCRDKeyMap (computed at init).
var crdToDBKeyMap map[string]string

func init() {
	crdToDBKeyMap = make(map[string]string, len(DBToCRDKeyMap))
	for dbKey, crdKey := range DBToCRDKeyMap {
		crdToDBKeyMap[crdKey] = dbKey
	}
}

// MapRequestToDB converts CRD camelCase keys in a request map to DB snake_case keys.
// Deprecated: Only needed when PostgresRepository is used as the agent store.
func MapRequestToDB(req map[string]any) map[string]any {
	result := make(map[string]any, len(req))
	for crdKey, dbKey := range crdToDBKeyMap {
		if v, ok := req[crdKey]; ok {
			result[dbKey] = v
		}
	}
	return result
}

// BuildCRDSpec builds a CRD spec map from a stored Agent's Config JSONB.
// Used by DeployHandler when deploying agents from the PostgresRepository path.
//
// Note: `storage` is intentionally omitted when not explicitly set so the
// operator can pick the right default (postgresql if a DATABASE_URL is
// configured, otherwise memory). Hardcoding "memory" here would silently
// override that behaviour and reintroduce the conversation-loss bug.
func BuildCRDSpec(ag *Agent) map[string]interface{} {
	cfg := map[string]interface{}{}
	if len(ag.Config) > 0 {
		_ = json.Unmarshal(ag.Config, &cfg)
	}

	spec := map[string]interface{}{
		"name":      ag.Name,
		"framework": ag.Framework,
		"strategy":  cfgStr(cfg, "strategy", "agent-react"),
		"channel":   cfgStr(cfg, "channel", "rest"),
		"modelType": cfgStr(cfg, "model_type", "ollama"),
		"modelId":   cfgStr(cfg, "model_id", "qwen3.5:4b"),
		"image":     cfgStr(cfg, "image", "ghcr.io/recif-platform/corail:latest"),
		"replicas":  int64(1),
	}
	if storage, ok := cfg["storage"].(string); ok && storage != "" {
		spec["storage"] = storage
	}
	if sp, ok := cfg["system_prompt"].(string); ok && sp != "" {
		spec["systemPrompt"] = sp
	}
	if tools, ok := cfg["tools"].([]interface{}); ok && len(tools) > 0 {
		spec["tools"] = tools
	}
	if skills, ok := cfg["skills"].([]interface{}); ok && len(skills) > 0 {
		spec["skills"] = skills
	}
	if sa, ok := cfg["gcp_service_account"].(string); ok && sa != "" {
		spec["gcpServiceAccount"] = sa
	}
	return spec
}

// MergeAllFieldsIntoConfig stores model_type, model_id, system_prompt, tools,
// skills, storage, strategy, channel, and image inside the config JSONB.
func MergeAllFieldsIntoConfig(req CreateAgentRequest) json.RawMessage {
	cfg := map[string]any{}
	if len(req.Config) > 0 {
		_ = json.Unmarshal(req.Config, &cfg) //nolint:errcheck // best-effort merge
	}
	setIfNotEmpty := func(key, val string) {
		if val != "" {
			cfg[key] = val
		}
	}
	setIfNotEmpty("model_type", req.ModelType)
	setIfNotEmpty("model_id", req.ModelID)
	setIfNotEmpty("system_prompt", req.SystemPrompt)
	setIfNotEmpty("prompt_ref", req.PromptRef)
	setIfNotEmpty("strategy", req.Strategy)
	setIfNotEmpty("channel", req.Channel)
	setIfNotEmpty("storage", req.Storage)
	setIfNotEmpty("image", req.Image)
	if len(req.Tools) > 0 {
		cfg["tools"] = req.Tools
	}
	if len(req.Skills) > 0 {
		cfg["skills"] = req.Skills
	}
	if len(req.EnvSecrets) > 0 {
		cfg["env_secrets"] = req.EnvSecrets
	}
	setIfNotEmpty("gcp_service_account", req.GCPServiceAccount)
	setIfNotEmpty("suggestions_provider", req.SuggestionsProvider)
	setIfNotEmpty("suggestions", req.Suggestions)
	setIfNotEmpty("judge_model", req.JudgeModel)
	if req.EvalSampleRate > 0 {
		cfg["eval_sample_rate"] = req.EvalSampleRate
	}
	out, _ := json.Marshal(cfg) //nolint:errcheck // always valid
	return out
}

// cfgStr reads a string from a config map with a default.
func cfgStr(cfg map[string]interface{}, key, fallback string) string {
	if v, ok := cfg[key].(string); ok && v != "" {
		return v
	}
	return fallback
}

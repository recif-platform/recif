package agent

import "encoding/json"

// crdToDBKeyMap is the single source of truth for mapping CRD camelCase keys
// to DB snake_case keys.
var crdToDBKeyMap = map[string]string{
	"modelType":      "model_type",
	"modelId":        "model_id",
	"systemPrompt":   "system_prompt",
	"strategy":       "strategy",
	"channel":        "channel",
	"storage":        "storage",
	"image":          "image",
	"replicas":       "replicas",
	"tools":          "tools",
	"skills":         "skills",
	"knowledgeBases":      "knowledge_bases",
	"suggestionsProvider": "suggestions_provider",
	"suggestions":         "suggestions",
	"evalSampleRate":      "eval_sample_rate",
	"judgeModel":          "judge_model",
}

// MapRequestToDB converts CRD camelCase keys in a request map to DB snake_case keys.
func MapRequestToDB(req map[string]any) map[string]any {
	result := make(map[string]any, len(req))
	for crdKey, dbKey := range crdToDBKeyMap {
		if v, ok := req[crdKey]; ok {
			result[dbKey] = v
		}
	}
	return result
}

// MapDBToCRD converts DB snake_case config keys to CRD camelCase keys.
func MapDBToCRD(config map[string]any) map[string]any {
	result := make(map[string]any, len(config))
	// Build reverse map
	for crdKey, dbKey := range crdToDBKeyMap {
		if v, ok := config[dbKey]; ok {
			result[crdKey] = v
		}
	}
	return result
}

// BuildCRDSpec builds a CRD spec map from a stored Agent's Config JSONB.
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
		"storage":   cfgStr(cfg, "storage", "memory"),
		"image":     cfgStr(cfg, "image", "corail:latest"),
		"replicas":  int64(1),
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

// BuildCRDSpecFromRequest builds a CRD spec map from a CreateAgentRequest.
func BuildCRDSpecFromRequest(req CreateAgentRequest) map[string]interface{} {
	spec := map[string]interface{}{
		"name":      req.Name,
		"framework": req.Framework,
		"strategy":  valOrDefault(req.Strategy, "agent-react"),
		"channel":   valOrDefault(req.Channel, "rest"),
		"modelType": valOrDefault(req.ModelType, "ollama"),
		"modelId":   valOrDefault(req.ModelID, "qwen3.5:4b"),
		"storage":   valOrDefault(req.Storage, "memory"),
		"image":     valOrDefault(req.Image, "corail:latest"),
		"replicas":  int64(1),
	}
	if req.SystemPrompt != "" {
		spec["systemPrompt"] = req.SystemPrompt
	}
	if len(req.Tools) > 0 {
		spec["tools"] = req.Tools
	}
	if len(req.Skills) > 0 {
		spec["skills"] = req.Skills
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
	setIfNotEmpty("suggestions_provider", req.SuggestionsProvider)
	setIfNotEmpty("suggestions", req.Suggestions)
	setIfNotEmpty("judge_model", req.JudgeModel)
	if req.EvalSampleRate > 0 {
		cfg["eval_sample_rate"] = req.EvalSampleRate
	}
	out, _ := json.Marshal(cfg) //nolint:errcheck // always valid
	return out
}

// valOrDefault returns val if non-empty, otherwise fallback.
func valOrDefault(val, fallback string) string {
	if val != "" {
		return val
	}
	return fallback
}

// cfgStr reads a string from a config map with a default.
func cfgStr(cfg map[string]interface{}, key, fallback string) string {
	if v, ok := cfg[key].(string); ok && v != "" {
		return v
	}
	return fallback
}

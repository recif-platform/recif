import { getAuthHeaders, clearToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Wrapper around fetch that automatically injects the JWT and handles 401s. */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
  return res;
}

/* ------------------------------------------------------------------ */
/*  Auth API                                                           */
/* ------------------------------------------------------------------ */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export async function login(email: string, password: string): Promise<{ token: string; user: CurrentUser }> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Invalid email or password");
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await apiFetch("/api/v1/auth/me");
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: string;
  framework: string;
  description?: string;
  created_at: string;
  strategy?: string;
  channel?: string;
  model_type?: string;
  model_id?: string;
  system_prompt?: string;
  storage?: string;
  image?: string;
  replicas?: number;
  endpoint?: string;
  phase?: string;
  tools?: string[];
  knowledgeBases?: string[];
  knowledge_bases?: string[];
  skills?: string[];
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await apiFetch("/api/v1/agents");
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function deployAgent(id: string): Promise<Agent> {
  const res = await apiFetch(`/api/v1/agents/${id}/deploy`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to deploy agent: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function stopAgent(id: string): Promise<Agent> {
  const res = await apiFetch(`/api/v1/agents/${id}/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop agent: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function restartAgent(id: string): Promise<Agent> {
  const res = await apiFetch(`/api/v1/agents/${id}/restart`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to restart agent: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete agent: ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  K8s Events API                                                     */
/* ------------------------------------------------------------------ */

export interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  object_kind: string;
  object_name: string;
  timestamp: string;
  count: number;
}

export async function fetchAgentEvents(agentId: string): Promise<K8sEvent[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/events`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

/* ------------------------------------------------------------------ */
/*  Memory API                                                         */
/* ------------------------------------------------------------------ */

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  source: string;
  relevance: number;
  timestamp: string;
}

export interface MemoryStatus {
  enabled: boolean;
  backend: string;
  backend_label: string;
  persistent: boolean;
  search_type: string;
  search_label: string;
  scope: string;
  scope_label: string;
  storage_location: string;
  count: number;
}

export async function fetchMemoryStatus(agentSlug: string): Promise<MemoryStatus> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentSlug}/memory/status`);
  if (!res.ok) throw new Error(`Failed to fetch memory status: ${res.status}`);
  return res.json();
}

export async function fetchMemories(agentSlug: string, limit = 50): Promise<MemoryEntry[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentSlug}/memory?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch memories: ${res.status}`);
  const json = await res.json();
  return json.memories || [];
}

export async function storeMemory(
  agentSlug: string,
  content: string,
  category: string,
  source = "manual",
): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentSlug}/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, category, source }),
  });
  if (!res.ok) throw new Error(`Failed to store memory: ${res.status}`);
}

export async function searchMemories(
  agentSlug: string,
  query: string,
  topK = 10,
): Promise<MemoryEntry[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentSlug}/memory/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Failed to search memories: ${res.status}`);
  const json = await res.json();
  return json.memories || [];
}

export async function deleteMemory(agentSlug: string, entryId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentSlug}/memory/${entryId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Integrations API                                                   */
/* ------------------------------------------------------------------ */

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
}

export interface IntegrationType {
  type: string;
  label: string;
  description: string;
  icon: string;
  config_fields: ConfigField[];
  credential_fields: ConfigField[];
  exposed_tools: string[];
}

export interface CreateIntegrationParams {
  name: string;
  type: string;
  config: Record<string, string>;
  credentials: Record<string, string>;
}

export async function fetchIntegrations(): Promise<Integration[]> {
  const res = await fetch(`${API_URL}/api/v1/integrations`);
  if (!res.ok) throw new Error(`Failed to fetch integrations: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchIntegrationTypes(): Promise<IntegrationType[]> {
  const res = await fetch(`${API_URL}/api/v1/integrations/types`);
  if (!res.ok) throw new Error(`Failed to fetch integration types: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createIntegration(params: CreateIntegrationParams): Promise<Integration> {
  const res = await fetch(`${API_URL}/api/v1/integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to create integration: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deleteIntegration(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/integrations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete integration: ${res.status}`);
}

export async function testIntegration(id: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/integrations/${id}/test`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to test integration: ${res.status}`);
  const json = await res.json();
  return json.data;
}

/* ------------------------------------------------------------------ */
/*  Skills API                                                         */
/* ------------------------------------------------------------------ */

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: string;
  version: string;
  author: string;
  source: string;
  compatibility: string[];
  channel_filter: string[];
  tools: string[];
  scripts: Record<string, string>;
  references: Record<string, string>;
  assets: Record<string, string>;
  builtin: boolean;
  created_at: string;
}

export async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch(`${API_URL}/api/v1/skills`);
  if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createSkill(
  skill: Omit<Skill, "id" | "builtin" | "created_at">,
): Promise<Skill> {
  const res = await fetch(`${API_URL}/api/v1/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(skill),
  });
  if (!res.ok) throw new Error(`Failed to create skill: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function updateSkill(
  id: string,
  skill: Partial<Omit<Skill, "id" | "builtin" | "created_at">>,
): Promise<Skill> {
  const res = await fetch(`${API_URL}/api/v1/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(skill),
  });
  if (!res.ok) throw new Error(`Failed to update skill: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deleteSkill(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/skills/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete skill: ${res.status}`);
}

export async function importSkill(
  source: string,
  token?: string,
): Promise<Skill> {
  const res = await fetch(`${API_URL}/api/v1/skills/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, token: token || "" }),
  });
  if (!res.ok) throw new Error(`Failed to import skill: ${res.status}`);
  const json = await res.json();
  return json.data;
}

/* ------------------------------------------------------------------ */
/*  Governance API                                                     */
/* ------------------------------------------------------------------ */

export interface ScorecardMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  status: string;
}

export interface ScoreDimension {
  score: number;
  grade: string;
  metrics: ScorecardMetric[];
}

export interface Scorecard {
  agent_id: string;
  agent_name: string;
  overall: number;
  quality: ScoreDimension;
  safety: ScoreDimension;
  cost: ScoreDimension;
  compliance: ScoreDimension;
  updated_at: string;
}

export interface GuardrailRule {
  type: string;
  operator: string;
  value: string;
}

export interface GuardrailPolicy {
  id: string;
  name: string;
  description: string;
  rules: GuardrailRule[];
  severity: string;
  enabled: boolean;
}

export async function fetchScorecards(): Promise<Scorecard[]> {
  const res = await fetch(`${API_URL}/api/v1/governance/scorecards`);
  if (!res.ok) throw new Error(`Failed to fetch scorecards: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchScorecard(agentId: string): Promise<Scorecard> {
  const res = await fetch(`${API_URL}/api/v1/governance/scorecards/${agentId}`);
  if (!res.ok) throw new Error(`Failed to fetch scorecard: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchPolicies(): Promise<GuardrailPolicy[]> {
  const res = await fetch(`${API_URL}/api/v1/governance/policies`);
  if (!res.ok) throw new Error(`Failed to fetch policies: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createPolicy(policy: Omit<GuardrailPolicy, "id">): Promise<GuardrailPolicy> {
  const res = await fetch(`${API_URL}/api/v1/governance/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
  if (!res.ok) throw new Error(`Failed to create policy: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deletePolicy(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/governance/policies/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete policy: ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Releases API                                                       */
/* ------------------------------------------------------------------ */

export interface Release {
  version: number;
  status: string;
  author: string;
  timestamp: string;
  changelog: string;
  checksum: string;
  artifact?: any;
}

export interface ReleaseDiff {
  path: string;
  from: any;
  to: any;
}

export async function fetchReleases(agentId: string): Promise<Release[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/releases`);
  if (!res.ok) throw new Error(`Failed to fetch releases: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createRelease(agentId: string, changelog: string): Promise<Release> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changelog }),
  });
  if (!res.ok) throw new Error(`Failed to create release: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getRelease(agentId: string, version: number): Promise<Release> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/releases/${version}`);
  if (!res.ok) throw new Error(`Failed to get release: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deployRelease(agentId: string, version: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/releases/${version}/deploy`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to deploy release: ${res.status}`);
}

export async function diffReleases(agentId: string, from: number, to: number): Promise<ReleaseDiff[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/releases/diff?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Failed to diff releases: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

/* ------------------------------------------------------------------ */
/*  Canary API                                                         */
/* ------------------------------------------------------------------ */

export interface CanaryStatus {
  enabled: boolean;
  weight: number;
  champion_version: string;
  challenger_version: string;
  champion_model_id: string;
  challenger_model_id: string;
}

export async function startCanary(
  agentId: string,
  challengerVersion: number,
  weight: number = 10,
): Promise<CanaryStatus> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/canary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenger_version: challengerVersion, weight }),
  });
  if (!res.ok) throw new Error(`Failed to start canary: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function adjustCanaryWeight(
  agentId: string,
  weight: number,
): Promise<CanaryStatus> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/canary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight }),
  });
  if (!res.ok) throw new Error(`Failed to adjust canary weight: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getCanaryStatus(agentId: string): Promise<CanaryStatus> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/canary`);
  if (!res.ok) throw new Error(`Failed to get canary status: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function promoteCanary(agentId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/canary/promote`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to promote canary: ${res.status}`);
}

export async function rollbackCanary(agentId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/canary/rollback`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to rollback canary: ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Feedback API                                                       */
/* ------------------------------------------------------------------ */

export async function submitFeedback(
  agentId: string,
  value: "positive" | "negative",
  traceId?: string,
  conversationId?: string,
  comment?: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trace_id: traceId || "",
      agent_id: agentId,
      conversation_id: conversationId || "",
      name: "user_rating",
      value: value === "positive" ? 1 : 0,
      source: "human",
      comment: comment || "",
    }),
  });
  if (!res.ok) throw new Error(`Failed to submit feedback: ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Evaluation API                                                     */
/* ------------------------------------------------------------------ */

export interface EvalRun {
  id: string;
  agent_id: string;
  agent_version: string;
  dataset_name: string;
  status: string;
  aggregate_scores: Record<string, number>;
  total_cases: number;
  passed_cases: number;
  provider?: string;
  started_at: string;
  completed_at?: string;
}

export interface EvalDataset {
  id: string;
  name: string;
  case_count: number;
  created_at: string;
}

export interface EvalComparison {
  run_a: string;
  run_b: string;
  metrics: Record<string, { a: number; b: number; diff: number; winner: string }>;
  winner: string;
}

export async function fetchEvalRuns(agentId: string): Promise<EvalRun[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/evaluations`);
  if (!res.ok) throw new Error(`Failed to fetch eval runs: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function triggerEval(agentId: string, datasetName: string, version?: string): Promise<EvalRun> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_name: datasetName, version: version || "" }),
  });
  if (!res.ok) throw new Error(`Failed to trigger eval: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getEvalRun(agentId: string, runId: string): Promise<EvalRun> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/evaluations/${runId}`);
  if (!res.ok) throw new Error(`Failed to get eval run: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function compareEvalRuns(agentId: string, runA: string, runB: string): Promise<EvalComparison> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/evaluations/compare?a=${runA}&b=${runB}`);
  if (!res.ok) throw new Error(`Failed to compare eval runs: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchDatasets(agentId: string): Promise<EvalDataset[]> {
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/datasets`);
  if (!res.ok) throw new Error(`Failed to fetch datasets: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function uploadDataset(agentId: string, name: string, caseCount: number): Promise<EvalDataset> {
  const cases = Array.from({ length: caseCount }, (_, i) => ({
    input: `Test case ${i + 1}`,
    expected_output: `Expected output ${i + 1}`,
  }));
  const res = await fetch(`${API_URL}/api/v1/agents/${agentId}/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cases }),
  });
  if (!res.ok) throw new Error(`Failed to upload dataset: ${res.status}`);
  const json = await res.json();
  return json.data;
}

/* ------------------------------------------------------------------ */
/*  AI Radar API                                                       */
/* ------------------------------------------------------------------ */

export interface RadarMetrics {
  requests_total: number;
  requests_24h: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate_pct: number;
  tokens_consumed: number;
  estimated_cost_usd: number;
  active_conversations: number;
  memory_entries: number;
}

export interface RadarAlert {
  id: string;
  severity: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  created_at: string;
}

export interface AgentHealth {
  agent_id: string;
  agent_name: string;
  status: string;
  uptime_pct: number;
  last_seen: string;
  metrics: RadarMetrics;
  alerts: RadarAlert[];
}

export interface RadarOverview {
  total_agents: number;
  healthy: number;
  degraded: number;
  down: number;
  total_requests_24h: number;
  total_cost_24h_usd: number;
  agents: AgentHealth[];
}

export async function fetchRadarOverview(): Promise<RadarOverview> {
  const res = await fetch(`${API_URL}/api/v1/radar`);
  if (!res.ok) throw new Error(`Failed to fetch radar overview: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchAgentHealth(agentId: string): Promise<AgentHealth> {
  const res = await fetch(`${API_URL}/api/v1/radar/${agentId}`);
  if (!res.ok) throw new Error(`Failed to fetch agent health: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchAlerts(): Promise<RadarAlert[]> {
  const res = await fetch(`${API_URL}/api/v1/radar/alerts`);
  if (!res.ok) throw new Error(`Failed to fetch alerts: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

/* ------------------------------------------------------------------ */
/*  Platform Config API                                                */
/* ------------------------------------------------------------------ */

export interface PlatformConfig {
  state_repo: string;
  state_branch: string;
  state_token: string;
  mlflow_uri: string;
}

export async function fetchPlatformConfig(): Promise<PlatformConfig> {
  const res = await fetch(`${API_URL}/api/v1/platform/config`);
  if (!res.ok) throw new Error(`Failed to fetch platform config: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function updatePlatformConfig(cfg: Partial<PlatformConfig>): Promise<PlatformConfig> {
  const res = await fetch(`${API_URL}/api/v1/platform/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Failed to update platform config: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export interface ConnectionStatus {
  status: string;
  message: string;
}

export interface ConnectionTestResult {
  github: ConnectionStatus;
  mlflow: ConnectionStatus;
}

export async function testPlatformConnections(): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_URL}/api/v1/platform/config/test`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to test connections: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export interface SyncResultItem {
  agent: string;
  action: string;
  message?: string;
}

export interface SyncResult {
  synced: number;
  results: SyncResultItem[];
  message?: string;
}

export async function syncFromStateRepo(): Promise<SyncResult> {
  const res = await fetch(`${API_URL}/api/v1/platform/sync`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to sync: ${res.status}`);
  const json = await res.json();
  return json.data;
}

/* ------------------------------------------------------------------ */
/*  Teams API                                                          */
/* ------------------------------------------------------------------ */

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string;
  namespace: string;
  member_count: number;
  agent_count: number;
  created_at: string;
}

export interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch(`${API_URL}/api/v1/teams`);
  if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createTeam(name: string, description?: string): Promise<Team> {
  const res = await fetch(`${API_URL}/api/v1/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description || "" }),
  });
  if (!res.ok) throw new Error(`Failed to create team: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getTeam(teamId: string): Promise<{ team: Team; members: TeamMember[] }> {
  const res = await fetch(`${API_URL}/api/v1/teams/${teamId}`);
  if (!res.ok) throw new Error(`Failed to get team: ${res.status}`);
  return res.json();
}

export async function deleteTeam(teamId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/teams/${teamId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete team: ${res.status}`);
}

export async function addTeamMember(teamId: string, email: string, role: string): Promise<TeamMember> {
  const res = await fetch(`${API_URL}/api/v1/teams/${teamId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw new Error(`Failed to add team member: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to remove team member: ${res.status}`);
}

export async function updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to update member role: ${res.status}`);
}

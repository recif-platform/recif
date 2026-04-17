import { test, expect } from "@playwright/test";
import { getAuthToken, apiCall } from "./helpers";

const MLFLOW_URL = "http://localhost:5000";

test.describe("MLflow Integration", () => {
  test("MLflow is accessible", async () => {
    const res = await fetch(`${MLFLOW_URL}/health`);
    expect(res.status).toBe(200);
  });

  test("agent experiment exists in MLflow after agent creation", async () => {
    const token = await getAuthToken();

    // Get agents
    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents to test MLflow against");
      return;
    }

    const agentSlug = agents[0].slug || agents[0].id;

    // Check MLflow experiment exists
    const expRes = await fetch(
      `${MLFLOW_URL}/api/2.0/mlflow/experiments/get-by-name?experiment_name=recif/agents/${agentSlug}`
    );
    expect(expRes.status).toBe(200);
    const expData = await expRes.json();
    expect(expData.experiment).toBeDefined();
    expect(expData.experiment.lifecycle_stage).toBe("active");
  });

  test("MLflow experiment survives deletion and auto-restores", async () => {
    const token = await getAuthToken();

    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents to test");
      return;
    }

    const agentSlug = agents[0].slug || agents[0].id;
    const expName = `recif/agents/${agentSlug}`;

    // Get experiment ID
    const expRes = await fetch(
      `${MLFLOW_URL}/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(expName)}`
    );
    const { experiment } = await expRes.json();
    if (!experiment) {
      test.skip(true, "Experiment not found");
      return;
    }

    // Soft-delete the experiment
    await fetch(`${MLFLOW_URL}/api/2.0/mlflow/experiments/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiment_id: experiment.experiment_id }),
    });

    // Verify it's deleted
    const deletedRes = await fetch(
      `${MLFLOW_URL}/api/2.0/mlflow/experiments/get?experiment_id=${experiment.experiment_id}`
    );
    const deletedData = await deletedRes.json();
    expect(deletedData.experiment.lifecycle_stage).toBe("deleted");

    // Restart the agent pod to trigger auto-restore
    await apiCall("POST", `/api/v1/agents/${agents[0].id}/restart`, token);

    // Poll until experiment is restored (max 30s)
    let restored = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const checkRes = await fetch(
        `${MLFLOW_URL}/api/2.0/mlflow/experiments/get?experiment_id=${experiment.experiment_id}`
      );
      const checkData = await checkRes.json();
      if (checkData.experiment?.lifecycle_stage === "active") {
        restored = true;
        break;
      }
    }
    expect(restored).toBe(true);
  });

  test("logged model appears in MLflow Agent Versions", async () => {
    const token = await getAuthToken();

    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents to test");
      return;
    }

    const agentSlug = agents[0].slug || agents[0].id;

    // Get experiment ID
    const expRes = await fetch(
      `${MLFLOW_URL}/api/2.0/mlflow/experiments/get-by-name?experiment_name=recif/agents/${agentSlug}`
    );
    const { experiment } = await expRes.json();
    if (!experiment) {
      test.skip(true, "Experiment not found");
      return;
    }

    // Check logged models exist
    const modelsRes = await fetch(`${MLFLOW_URL}/api/2.0/mlflow/logged-models/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experiment_ids: [experiment.experiment_id],
        max_results: 10,
      }),
    });
    const modelsData = await modelsRes.json();
    const models = modelsData.models || [];
    expect(models.length).toBeGreaterThan(0);

    // Model name should contain the agent slug
    const modelName = models[0].info.name;
    expect(modelName).toContain(agentSlug);
  });

  test("eval API returns valid data for agent", async () => {
    const token = await getAuthToken();

    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents");
      return;
    }

    const agentId = agents[0].slug || agents[0].id;

    // List evals — should return 200 even if empty
    const evalRes = await apiCall("GET", `/api/v1/agents/${agentId}/evaluations`, token);
    expect(evalRes.status).toBe(200);
    const evalData = await evalRes.json();
    expect(evalData).toHaveProperty("data");
    expect(Array.isArray(evalData.data)).toBe(true);
  });

  test("feedback API accepts valid feedback", async () => {
    const token = await getAuthToken();

    // Submit feedback (doesn't require a real trace — should not crash)
    const fbRes = await apiCall("POST", "/api/v1/feedback", token, {
      trace_id: "tr-nonexistent",
      agent_id: "test",
      conversation_id: "",
      name: "user_rating",
      value: 1,
      source: "human",
      comment: "E2E test feedback",
    });
    // Should return 200 or 404 (trace not found) — NOT 500
    expect(fbRes.status).toBeLessThan(500);
  });

  test("releases API returns valid data", async () => {
    const token = await getAuthToken();

    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents");
      return;
    }

    const agentId = agents[0].slug || agents[0].id;

    const relRes = await apiCall("GET", `/api/v1/agents/${agentId}/releases`, token);
    expect(relRes.status).toBe(200);
    const relData = await relRes.json();
    expect(relData).toHaveProperty("data");
    expect(Array.isArray(relData.data)).toBe(true);
  });
});

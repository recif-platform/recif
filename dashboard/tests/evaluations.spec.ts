import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Evaluations", () => {
  test("evaluations page loads without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/evaluations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Evaluation/i })).toBeVisible();
    errors.expectClean();
  });

  test("eval runs API returns valid data for an agent", async () => {
    const token = await getAuthToken();

    // Get first agent
    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents to test evaluations against");
      return;
    }

    const agentId = agents[0].slug || agents[0].id;
    const res = await apiCall("GET", `/api/v1/agents/${agentId}/evaluations`, token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
});

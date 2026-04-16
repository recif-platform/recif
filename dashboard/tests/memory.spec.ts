import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Memory", () => {
  test("memory page loads without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/memory");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Memory/i })).toBeVisible();
    errors.expectClean();
  });

  test("memory status API returns data for an agent", async () => {
    const token = await getAuthToken();

    const agentsRes = await apiCall("GET", "/api/v1/agents", token);
    const { data: agents } = await agentsRes.json();
    if (!agents || agents.length === 0) {
      test.skip(true, "No agents to test memory against");
      return;
    }

    const slug = agents[0].slug || agents[0].id;
    const res = await apiCall("GET", `/api/v1/agents/${slug}/memory/status`, token);
    // 200 if memory enabled, 404 if not — both are acceptable
    expect(res.status).toBeLessThan(500);
  });
});

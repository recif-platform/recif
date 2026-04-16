import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Skills", () => {
  test("skills page loads with built-in tab", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Skills/i })).toBeVisible();
    errors.expectClean();
  });

  test("skills API returns valid data", async () => {
    const token = await getAuthToken();
    const res = await apiCall("GET", "/api/v1/skills", token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("create and delete custom skill via API", async () => {
    const token = await getAuthToken();

    const createRes = await apiCall("POST", "/api/v1/skills", token, {
      name: "e2e-test-skill",
      description: "Created by Playwright",
      category: "testing",
      instructions: "You are a test skill.",
      version: "1.0.0",
      author: "e2e",
      source: "test",
      compatibility: [],
      channel_filter: [],
      tools: [],
      scripts: {},
      references: {},
      assets: {},
    });
    expect(createRes.status).toBe(201);
    const { data: skill } = await createRes.json();
    expect(skill.name).toBe("e2e-test-skill");

    // Delete
    const delRes = await apiCall("DELETE", `/api/v1/skills/${skill.id}`, token);
    expect(delRes.status).toBeLessThan(300);
  });
});

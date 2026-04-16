import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Knowledge Bases", () => {
  test("knowledge page loads without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/knowledge");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Knowledge/i })).toBeVisible();
    errors.expectClean();
  });

  test("KB list API returns valid data", async () => {
    const token = await getAuthToken();
    const res = await apiCall("GET", "/api/v1/knowledge-bases", token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("create and delete knowledge base via API", async () => {
    const token = await getAuthToken();

    // Create KB
    const createRes = await apiCall("POST", "/api/v1/knowledge-bases", token, {
      name: "E2E-Test-KB",
      description: "Created by Playwright",
      embedding_model: "nomic-embed-text",
    });

    // If KB endpoints return 503 (no KB DB configured), skip gracefully
    if (createRes.status === 503) {
      test.skip(true, "KB database not configured (corail_storage missing)");
      return;
    }
    expect(createRes.status).toBe(201);
    const { data: kb } = await createRes.json();
    expect(kb.name).toBe("E2E-Test-KB");

    // Verify it appears in list
    const listRes = await apiCall("GET", "/api/v1/knowledge-bases", token);
    const { data: kbs } = await listRes.json();
    expect(kbs.some((k: { id: string }) => k.id === kb.id)).toBe(true);

    // Delete
    const delRes = await apiCall("DELETE", `/api/v1/knowledge-bases/${kb.id}`, token);
    expect(delRes.status).toBe(200);
  });
});

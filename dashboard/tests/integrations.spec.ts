import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Integrations", () => {
  test("integrations page loads without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Integration/i })).toBeVisible();
    errors.expectClean();
  });

  test("integration types API returns available types", async () => {
    const token = await getAuthToken();
    const res = await apiCall("GET", "/api/v1/integrations/types", token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("integrations list API returns valid data", async () => {
    const token = await getAuthToken();
    const res = await apiCall("GET", "/api/v1/integrations", token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
});

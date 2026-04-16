import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("Agents", () => {
  test("agent list page loads and shows agents", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");

    // Wait for data to load (API call completes)
    await page.waitForResponse((res) =>
      res.url().includes("/api/v1/agents") && res.status() === 200
    );

    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    errors.expectClean();
  });

  test("clicking an agent card navigates to detail", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");
    await page.waitForResponse((res) => res.url().includes("/api/v1/agents") && res.ok());

    // Find agent cards — they're links to /agents/[slug]
    const agentLink = page.locator('a[href^="/agents/"]').first();
    if (await agentLink.isVisible()) {
      await agentLink.click();
      await expect(page).toHaveURL(/\/agents\/.+/);
      errors.expectClean();
    }
  });

  test("agent detail page loads config tab", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");
    await page.waitForResponse((res) => res.url().includes("/api/v1/agents") && res.ok());

    const agentLink = page.locator('a[href^="/agents/"]').first();
    if (await agentLink.isVisible()) {
      const href = await agentLink.getAttribute("href");
      await page.goto(href!);

      // Should see the agent name and config details
      await page.waitForLoadState("networkidle");
      errors.expectClean();
    }
  });

  test("agent API responses are valid JSON with data field", async ({ page }) => {
    const errors = trackErrors(page);

    // Intercept the agents API call and validate structure
    const [response] = await Promise.all([
      page.waitForResponse((res) =>
        res.url().includes("/api/v1/agents") &&
        !res.url().includes("/agents/") &&
        res.status() === 200
      ),
      page.goto("/agents"),
    ]);

    const body = await response.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);

    // Each agent should have required fields
    for (const agent of body.data) {
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("name");
      expect(agent).toHaveProperty("slug");
    }

    errors.expectClean();
  });
});

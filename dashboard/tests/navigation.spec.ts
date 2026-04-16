import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers";

const pages = [
  { path: "/agents", label: "Agents" },
  { path: "/chat", label: "Chat" },
  { path: "/knowledge", label: "Knowledge" },
  { path: "/skills", label: "Skills" },
  { path: "/tools", label: "Tools" },
  { path: "/integrations", label: "Integrations" },
  { path: "/governance", label: "Governance" },
  { path: "/radar", label: "Radar" },
  { path: "/evaluations", label: "Evaluations" },
  { path: "/teams", label: "Teams" },
  { path: "/settings", label: "Settings" },
  { path: "/memory", label: "Memory" },
];

test.describe("Navigation", () => {
  for (const { path, label } of pages) {
    test(`${label} page (${path}) loads without errors`, async ({ page }) => {
      const errors = trackErrors(page);
      const response = await page.goto(path);

      // Page should return 200 (Next.js serves it)
      expect(response?.status()).toBeLessThan(400);

      // Wait for hydration — something should render
      await page.waitForLoadState("networkidle");

      // No 5xx from API, no console errors
      errors.expectClean();
    });
  }

  test("sidebar navigation links work", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");

    // Click on a few sidebar links and verify navigation
    for (const target of ["/knowledge", "/skills", "/settings"]) {
      await page.locator(`a[href="${target}"]`).click();
      await expect(page).toHaveURL(new RegExp(target));
    }
    errors.expectClean();
  });
});

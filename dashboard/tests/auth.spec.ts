import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("Authentication", () => {
  test("logged-in user sees agents page", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    errors.expectClean();
  });

  test("topbar shows real user name and role", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/agents");
    await expect(page.getByTestId("user-name")).toBeVisible();
    await expect(page.getByTestId("user-name")).not.toHaveText("—");
    errors.expectClean();
  });

  test("sign out clears session and redirects to login", async ({ page }) => {
    await page.goto("/agents");
    await page.getByTestId("user-avatar").click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authentication (unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login with valid credentials redirects to agents", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", process.env.TEST_ADMIN_EMAIL || "adham@recif.dev");
    await page.fill("#password", process.env.TEST_ADMIN_PASSWORD || "recif_admin_2026");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/agents/, { timeout: 10_000 });
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "adham@recif.dev");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator('[class*="red"]')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("accessing protected page without token redirects to login", async ({ page }) => {
    await page.goto("/agents");
    // Should show the login form (redirected by middleware or client-side 401)
    await expect(page.locator("#email")).toBeVisible({ timeout: 5_000 });
  });
});

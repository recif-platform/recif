import { test as setup } from "@playwright/test";

const authFile = "tests/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", process.env.TEST_ADMIN_EMAIL || "adham@recif.dev");
  await page.fill("#password", process.env.TEST_ADMIN_PASSWORD || "recif_admin_2026");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/agents", { timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});

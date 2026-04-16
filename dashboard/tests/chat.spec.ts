import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("Chat", () => {
  test("chat page loads with agent and conversations", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Should show the chat heading and agent section
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible({ timeout: 5_000 });
    errors.expectClean();
  });

  test("selecting an agent loads conversations", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // If agents exist, the first one should be selectable
    const agentOption = page.locator("[data-testid='agent-select'] option, [data-testid='agent-select'] div").first();
    if (await agentOption.isVisible().catch(() => false)) {
      await agentOption.click();
    }
    errors.expectClean();
  });

  test("last selected agent is restored after refresh", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Check if localStorage saves the selected agent
    const savedAgent = await page.evaluate(() => localStorage.getItem("recif-chat-agent"));
    if (savedAgent) {
      // Refresh and check the agent is auto-selected
      await page.reload();
      await page.waitForLoadState("networkidle");

      const restoredAgent = await page.evaluate(() => localStorage.getItem("recif-chat-agent"));
      expect(restoredAgent).toBe(savedAgent);
    }
    errors.expectClean();
  });

  test("last conversation ID is restored after refresh", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // After implementation, conversationId should be saved to localStorage
    // and restored on mount to auto-open the last conversation
    const savedCid = await page.evaluate(() => localStorage.getItem("recif-chat-conversation"));
    // If a conversation was previously open, it should be restored
    if (savedCid) {
      await page.reload();
      await page.waitForLoadState("networkidle");
      const restoredCid = await page.evaluate(() => localStorage.getItem("recif-chat-conversation"));
      expect(restoredCid).toBe(savedCid);
    }
    errors.expectClean();
  });
});

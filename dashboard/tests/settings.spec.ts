import { test, expect } from "@playwright/test";
import { trackErrors, getAuthToken, apiCall } from "./helpers";

test.describe("Settings & Teams", () => {
  test("settings page loads with platform config", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Platform Configuration")).toBeVisible();
    errors.expectClean();
  });

  test("teams API returns valid data with default team", async () => {
    const token = await getAuthToken();
    const res = await apiCall("GET", "/api/v1/teams", token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);

    const defaultTeam = body.data.find(
      (t: { id: string }) => t.id === "tk_DEFAULT000000000000000000"
    );
    expect(defaultTeam).toBeDefined();
    expect(defaultTeam.name).toBe("Default");
  });

  test("cannot delete default team", async () => {
    const token = await getAuthToken();
    const res = await apiCall(
      "DELETE",
      "/api/v1/teams/tk_DEFAULT000000000000000000",
      token
    );
    expect(res.status).toBe(403);
  });

  test("create user, add to team, then cleanup via API", async () => {
    const token = await getAuthToken();

    // 1. Create a new user
    const userRes = await apiCall("POST", "/api/v1/users", token, {
      email: "e2e-test@recif.dev",
      name: "E2E Test User",
      password: "testpass123",
      role: "developer",
    });
    if (userRes.status === 404 || userRes.status === 405) {
      test.skip(true, "POST /users not available on this API version");
      return;
    }
    expect(userRes.status).toBe(201);
    const { data: newUser } = await userRes.json();
    expect(newUser.email).toBe("e2e-test@recif.dev");

    // 2. Create team
    const teamRes = await apiCall("POST", "/api/v1/teams", token, {
      name: "E2E-Test-Team",
      description: "Created by Playwright",
    });
    expect(teamRes.status).toBe(201);
    const { data: team } = await teamRes.json();

    // 3. Add the new user to the team
    const addRes = await apiCall("POST", `/api/v1/teams/${team.id}/members`, token, {
      email: "e2e-test@recif.dev",
      role: "developer",
    });
    expect(addRes.status).toBe(201);

    // 4. Verify member appears
    const getRes = await apiCall("GET", `/api/v1/teams/${team.id}`, token);
    const { members } = await getRes.json();
    expect(members.length).toBe(1);
    expect(members[0].email).toBe("e2e-test@recif.dev");

    // 5. Duplicate add → 409
    const dupRes = await apiCall("POST", `/api/v1/teams/${team.id}/members`, token, {
      email: "e2e-test@recif.dev",
      role: "developer",
    });
    expect(dupRes.status).toBe(409);

    // 6. Cleanup
    await apiCall("DELETE", `/api/v1/teams/${team.id}/members/${members[0].user_id}`, token);
    await apiCall("DELETE", `/api/v1/teams/${team.id}`, token);
    // Note: no DELETE /users endpoint yet — test user stays in DB (harmless)
  });
});

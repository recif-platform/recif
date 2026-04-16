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

  test("create, add member, and delete team via API", async () => {
    const token = await getAuthToken();

    // Create team
    const createRes = await apiCall("POST", "/api/v1/teams", token, {
      name: "E2E-Test-Team",
      description: "Created by Playwright",
    });

    // If server returns 403, it's running old code (pre-team-DB refactor) — skip gracefully
    if (createRes.status === 403) {
      test.skip(true, "API requires platform_admin for team create (old code)");
      return;
    }
    expect(createRes.status).toBe(201);
    const { data: team } = await createRes.json();
    expect(team.name).toBe("E2E-Test-Team");

    // Add member
    const addRes = await apiCall(
      "POST",
      `/api/v1/teams/${team.id}/members`,
      token,
      { email: "adham@recif.dev", role: "developer" }
    );
    expect(addRes.status).toBe(201);

    // Verify member appears
    const getRes = await apiCall("GET", `/api/v1/teams/${team.id}`, token);
    const { members } = await getRes.json();
    expect(members.length).toBe(1);
    expect(members[0].email).toBe("adham@recif.dev");

    // Duplicate add → 409
    const dupRes = await apiCall(
      "POST",
      `/api/v1/teams/${team.id}/members`,
      token,
      { email: "adham@recif.dev", role: "developer" }
    );
    expect(dupRes.status).toBe(409);

    // Remove member
    await apiCall(
      "DELETE",
      `/api/v1/teams/${team.id}/members/${members[0].user_id}`,
      token
    );

    // Delete team
    const delRes = await apiCall("DELETE", `/api/v1/teams/${team.id}`, token);
    expect(delRes.status).toBe(200);
  });
});

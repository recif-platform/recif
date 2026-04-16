import { test as teardown } from "@playwright/test";
import { getAuthToken, apiCall } from "./helpers";

teardown("cleanup test data", async () => {
  const token = await getAuthToken();

  // Delete any teams created during tests (prefix "E2E-")
  const teamsRes = await apiCall("GET", "/api/v1/teams", token);
  if (teamsRes.ok) {
    const { data } = await teamsRes.json();
    for (const team of data ?? []) {
      if (team.name?.startsWith("E2E-")) {
        await apiCall("DELETE", `/api/v1/teams/${team.id}`, token);
      }
    }
  }

  // Delete any skills created during tests (prefix "e2e-")
  const skillsRes = await apiCall("GET", "/api/v1/skills", token);
  if (skillsRes.ok) {
    const { data } = await skillsRes.json();
    for (const skill of data ?? []) {
      if (skill.name?.startsWith("e2e-")) {
        await apiCall("DELETE", `/api/v1/skills/${skill.id}`, token);
      }
    }
  }
});

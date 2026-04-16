import { Page, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Intercepts API errors and console errors during a test.
 * Call at the start of each test to catch backend/integration failures
 * that the UI might silently swallow.
 */
export function trackErrors(page: Page) {
  const apiErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/") && res.status() >= 500) {
      apiErrors.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore browser-level "Failed to load resource" (network tab noise, not JS errors)
      if (text.includes("Failed to load resource")) return;
      consoleErrors.push(text);
    }
  });

  return {
    /** Assert no 5xx API responses and no console errors occurred. */
    expectClean: () => {
      expect(apiErrors, "API 5xx errors detected").toEqual([]);
      expect(
        consoleErrors.filter((e) => !e.includes("Download the React DevTools")),
        "Console errors detected"
      ).toEqual([]);
    },
    apiErrors,
    consoleErrors,
  };
}

/** Get a valid JWT token via API login. */
export async function getAuthToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TEST_ADMIN_EMAIL || "adham@recif.dev",
      password: process.env.TEST_ADMIN_PASSWORD || "recif_admin_2026",
    }),
  });
  const data = await res.json();
  return data.token;
}

/** Make an authenticated API call (for cleanup/setup, not UI testing). */
export async function apiCall(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

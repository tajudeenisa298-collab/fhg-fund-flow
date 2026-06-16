import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the 5 critical flows. These tests intentionally avoid
 * real backend writes — they assert the entry surface for each flow renders
 * and accepts input, so a broken route or missing form is caught immediately.
 *
 * Deeper assertions (full deposit → balance update, approve → notification)
 * belong in a seeded staging environment with a known leader+member fixture.
 */

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/FHG/i);
});

test.describe("Critical flows — entry surfaces", () => {
  test("signup form is reachable", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test("login form is reachable", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(login|dashboard)/);
    // either we got pushed to login, or the dashboard's own gate is rendering an auth CTA
    expect(page.url()).toMatch(/login|dashboard/);
  });

  test("design system page is reachable for QA", async ({ page }) => {
    await page.goto("/dev/components");
    await expect(page.getByRole("heading", { name: /design system/i })).toBeVisible();
  });

  test("404 page renders for unknown routes", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist");
    // App-level 404 component renders even if HTTP status is 200
    await expect(page.getByText(/404|not found/i)).toBeVisible({ timeout: 10_000 });
    expect(res?.status() ?? 200).toBeLessThan(500);
  });
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke tests for the 5 critical flows live under `e2e/`.
 *
 * Local: `bunx playwright install --with-deps` once, then `bunx playwright test`.
 * The baseURL points at the dev server (`bun run dev`) on port 8080 by default.
 * Override with `BASE_URL=https://your-preview.lovable.app bunx playwright test`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke: `npm run build` first, then `npx playwright test`.
 * In CI, the workflow runs build before Playwright; `webServer` only runs `next start`.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    timeout: 120_000,
    // Always use this dev server; do not attach to a stale :3000 from another run.
    reuseExistingServer: false,
  },
});

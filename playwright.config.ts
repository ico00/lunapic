import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const require = createRequire(path.join(process.cwd(), "package.json"));
const basePath: string = require(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
) as string;
const appOrigin = "http://127.0.0.1:3000";
const appStartUrl = `${appOrigin}${basePath}`;

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
    baseURL: appOrigin,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: appStartUrl,
    timeout: 120_000,
    // Always use this dev server; do not attach to a stale :3000 from another run.
    reuseExistingServer: false,
  },
});

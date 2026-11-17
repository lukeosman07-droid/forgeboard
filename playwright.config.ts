import { defineConfig, devices } from "@playwright/test";

// Browser tests. They drive the production build, so run `npm run build` first,
// then `npm run test:e2e`. Settings come from .env.local (or the CI environment).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already in the environment.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  // "github" turns each failure into an annotation on the run, readable without the full log.
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Turns on /dashboard/test-error, the page the error-screen test visits.
    env: { E2E_TEST_HOOKS: "1" },
  },
});

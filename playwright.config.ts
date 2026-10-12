import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config. Designed to run inside the official Playwright
 * Docker image — the host does NOT need Playwright or any browser
 * binaries installed. See the `e2e` service in docker-compose.yml
 * and the "Running the e2e tests" section in the README.
 *
 * The web app is expected to be reachable at E2E_BASE_URL (default
 * http://web:3000, which is the docker-compose service name).
 */
export default defineConfig({
  testDir: './tests/e2e',
  // The 10-iterations test already serializes itself; keep this
  // single-worker so we don't accidentally hit the Supabase project
  // with parallel logins.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://web:3000',
    trace: 'retain-on-failure',
    // We capture console errors explicitly in the tests, but the
    // default trace + screenshot are useful when the test fails.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Cache disabled per the user's spec. In Playwright this is
    // achieved per-request by route() — we set the default
    // service-worker behavior to off just in case.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

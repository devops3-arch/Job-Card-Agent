import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * This file used to import `lovable-agent-playwright-config`, a package that is
 * not installed, so `playwright test` failed at load before running anything —
 * which went unnoticed because there were no specs to run either.
 *
 * Playwright starts both halves of the app itself: the Express API and the Vite
 * dev server. Both are launched with `node <bin>` rather than through npm scripts
 * because node_modules/.bin is not executable in this checkout.
 */

const API_PORT = Number(process.env.E2E_API_PORT ?? 5099);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 8099);

export const E2E_API_URL = `http://localhost:${API_PORT}`;
export const E2E_WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * The database these tests run against.
 *
 * Spelled out here rather than inherited, because backend/.env points
 * DATABASE_URL at the Azure production database — inheriting the environment
 * would mean the suite created, approved and deleted job cards in production.
 * dotenv does not override variables that are already set, so passing these
 * explicitly is what keeps the server on the local database. e2e/globalSetup.ts
 * refuses to run if this ever resolves to a non-local host.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://shivampandey@localhost:5432/jobcard_dev";

const backendEnv = {
  DATABASE_URL: E2E_DATABASE_URL,
  // Overridden as well, since db.js falls back to these when DATABASE_URL is absent
  // and .env would otherwise supply the production host.
  PGHOST: "localhost",
  PGPORT: "5432",
  PGDATABASE: "jobcard_dev",
  PGUSER: "shivampandey",
  PGPASSWORD: "",
  PGSSLMODE: "disable",
  NODE_ENV: "development",
  PORT: String(API_PORT),
  // The background workers poll on a timer and have nothing to do with these
  // tests; leaving them off keeps the server log readable when a spec fails.
  WORKER_ENABLED: "false",
  ACCESS_TOKEN_SECRET: "e2e-access-secret",
  REFRESH_TOKEN_SECRET: "e2e-refresh-secret",
  JWT_SECRET: "e2e-access-secret",
  FRONTEND_URL: E2E_WEB_URL,
  // The login limiter allows 10 attempts per account per 15 minutes, and one of
  // these specs deliberately spends failures proving that. Raised here so the
  // real limit stays testable without the rest of the suite tripping over it.
  AUTH_RATE_LIMIT_MAX: "500",
  GLOBAL_RATE_LIMIT_MAX: "5000",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/globalSetup.ts",
  // A failing spec should not leave the next one guessing; run them in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: E2E_WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "node server.js",
      cwd: "backend",
      url: `${E2E_API_URL}/health`,
      env: backendEnv,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${WEB_PORT} --strictPort`,
      url: E2E_WEB_URL,
      env: { VITE_API_BASE_URL: E2E_API_URL },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  ],
});

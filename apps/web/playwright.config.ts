import { defineConfig, devices } from "@playwright/test";

const WEB_TEST_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? "5190";
const API_TEST_PORT = process.env.PLAYWRIGHT_API_PORT ?? "3190";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_TEST_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm --dir ../api exec tsx e2e/evaluation-test-server.ts`,
      url: `http://127.0.0.1:${API_TEST_PORT}/api/test-ready`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { EVALUATION_TEST_PORT: API_TEST_PORT },
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_TEST_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_TEST_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_TEST_PORT}` },
    },
  ],
});

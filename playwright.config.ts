import { defineConfig, devices } from "@playwright/test";

const WEB_URL = "http://localhost:8090";

// Expo 웹(Metro)을 띄워 화면을 사용자처럼 눌러 본다. Metro 는 첫 요청 때 번들을 만들어 느리다.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: true,
  fullyParallel: false,
  // 같은 기기 DB(OPFS)를 여러 탭이 함께 열면 잠금이 걸린다. 한 번에 한 시험만 돈다.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm web",
    url: WEB_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});

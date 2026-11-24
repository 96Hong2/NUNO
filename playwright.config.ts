import { defineConfig, devices } from "@playwright/test";
import { ONBOARDED_STATE } from "./e2e/storage-state";

// 개발 서버(pnpm web, 8090)와 다른 포트에 이 체크아웃의 서버를 따로 띄운다.
// 떠 있는 서버를 다시 쓰면 다른 작업 트리의 코드를 시험할 수 있다.
// worktree 둘이 함께 돌면 NUNO_E2E_PORT, NUNO_E2E_API_PORT, NUNO_DB_PORT 를 모두 서로 다르게 준다.
// e2e 는 Docker 의 로컬 Postgres 를 쓰므로 Docker 가 켜져 있어야 한다.
const PORT = Number(process.env.NUNO_E2E_PORT ?? 8091);
const WEB_URL = `http://localhost:${PORT}`;
// API 서버도 개발 API(8787)와 다른 포트에 nuno_e2e DB 로 새로 띄운다(scripts/e2e-api.mjs).
const API_PORT = Number(process.env.NUNO_E2E_API_PORT ?? 8877);
const API_URL = `http://localhost:${API_PORT}`;

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
  // setup 이 온보딩을 마친 기기 저장소를 만들고, chromium 의 시험은 그 상태로 열린다.
  // 빈 저장소가 필요한 시험은 그 파일에서 storageState 를 비운다.
  projects: [
    {
      name: "setup",
      testMatch: "**/onboarding.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: ONBOARDED_STATE },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter mobile exec expo start --port ${PORT}`,
      url: WEB_URL,
      env: { EXPO_PUBLIC_API_URL: API_URL },
      timeout: 180_000,
      reuseExistingServer: false,
      // 번들 오류는 Metro stdout 에만 나온다. 버리면 실패 원인이 로그에 남지 않는다.
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node scripts/e2e-api.mjs",
      url: `${API_URL}/v1/health`,
      env: { NUNO_E2E_API_PORT: String(API_PORT), NUNO_WEB_ORIGINS: WEB_URL },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

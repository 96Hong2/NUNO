import { defineConfig, devices } from "@playwright/test";

// 개발 서버(pnpm web, 8090)와 다른 포트에 이 체크아웃의 서버를 따로 띄운다.
// 떠 있는 서버를 다시 쓰면 다른 작업 트리의 코드를 시험할 수 있다. worktree 둘이 함께 돌면 포트를 바꾼다.
const PORT = Number(process.env.NUNO_E2E_PORT ?? 8091);
const WEB_URL = `http://localhost:${PORT}`;

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
    command: `pnpm --filter mobile exec expo start --port ${PORT}`,
    url: WEB_URL,
    timeout: 180_000,
    reuseExistingServer: false,
    // 번들 오류는 Metro stdout 에만 나온다. 버리면 실패 원인이 로그에 남지 않는다.
    stdout: "pipe",
    stderr: "pipe",
  },
});

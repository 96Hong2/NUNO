import { chromium, type FullConfig } from "@playwright/test";

// 첫 화면을 한 번 열어 Metro 가 웹 번들을 미리 만들게 한다. 시험마다 번들을 기다리지 않는다.
// 번들 응답이 오류(문법 오류 등은 Metro 가 500 으로 준다)이거나 첫 화면에서 오류가 나면
// 「홈」 탭을 기다리지 않고 그 오류로 바로 실패한다. 원인 글은 [WebServer] 로그에도 남는다.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("playwright.config.ts 의 use.baseURL 이 없다");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const pageError = new Promise<never>((_, reject) => {
      page.on("pageerror", (error) => reject(new Error(`첫 화면 오류: ${error.message}`)));
      page.on("response", (response) => {
        if (response.url().includes(".bundle") && response.status() >= 400) {
          reject(new Error(`번들 응답 ${response.status()}: ${response.url()}`));
        }
      });
    });
    // 「홈」 이 먼저 뜬 뒤 나는 오류는 각 시험이 본다. 여기서는 처리하지 않은 거부로 남기지 않는다.
    pageError.catch(() => undefined);
    await Promise.race([
      (async () => {
        await page.goto(baseURL, { timeout: 120_000 });
        await page.getByRole("tab", { name: "홈" }).waitFor({ timeout: 120_000 });
      })(),
      pageError,
    ]);
  } finally {
    await browser.close();
  }
}

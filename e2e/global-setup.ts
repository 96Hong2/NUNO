import { chromium, type FullConfig } from "@playwright/test";

// 첫 화면을 한 번 열어 Metro 가 웹 번들을 미리 만들게 한다. 시험마다 번들을 기다리지 않는다.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:8090";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { timeout: 180_000 });
    await page.getByRole("tab", { name: "홈" }).waitFor({ timeout: 180_000 });
  } finally {
    await browser.close();
  }
}

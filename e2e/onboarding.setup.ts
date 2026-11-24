import { expect, test as setup } from "@playwright/test";
import { ONBOARDED_STATE } from "./storage-state";

// 온보딩을 마친 기기 저장소(OPFS)를 한 번 만들어 둔다. 기존 시험은 이 상태로 열려 온보딩 화면을 거치지 않는다.
// 앱이 OPFS 파일을 쥔 채로는 읽지 못하므로, 앱을 닫고 빈 페이지에서 담는다.
setup("온보딩을 마친 기기 저장소를 만든다", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "생년월일을 알려 주세요" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("tab", { name: "홈" })).toBeVisible();
  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await tour.getByRole("button", { name: "닫기" }).click();
  await expect(tour).toHaveCount(0);
  await page.goto("about:blank");
  await context.storageState({ path: ONBOARDED_STATE, opfs: true });
});

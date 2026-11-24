import { expect, test } from "@playwright/test";

// T2 의 주 흐름 하나. 기대값은 로드맵 T2 DoD(D1, D6, D7, D11)와 plan_T2.md 「화면 문구」 에서 가져온다.
// 온보딩을 마친 준비 저장소가 아니라 빈 저장소에서 연다.
test.use({ storageState: { cookies: [], origins: [] } });

test("빈 저장소에서 생년월일, 세린, 「건너뛰기」 로 홈 무대에 세린이 서고, 둘러보기는 닫으면 다시 뜨지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("생년월일")).toHaveValue("2002-03-14");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "세린" }).click();
  await page.getByRole("button", { name: "세린으로 시작" }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // 웹 그림은 이름 붙은 바깥 상자와 안쪽 img 태그 둘로 그려진다. 같은 그림이라 첫째를 본다.
  const stage = page.getByRole("img", { name: "세린 기본 코디" }).first();
  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await expect(stage).toBeVisible();
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "닫기" }).click();
  await expect(tour).toHaveCount(0);

  await page.reload();
  await expect(stage).toBeVisible();
  await expect(tour).toHaveCount(0);
});

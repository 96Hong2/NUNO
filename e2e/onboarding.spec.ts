import { expect, test } from "@playwright/test";

// T2 의 주 흐름 하나. 기대값은 로드맵 T2 DoD(D1, D6, D7, D11)에서, 처음 둘러보기 글은 와이어프레임 v27 01-5 에서 가져온다.
// 온보딩을 마친 준비 저장소가 아니라 빈 저장소에서 연다.
test.use({ storageState: { cookies: [], origins: [] } });

test("빈 저장소에서 생년월일, 세린, 「건너뛰기」 로 홈 무대에 세린이 서고, 둘러보기 두 장을 「시작하기」 로 마치면 다시 뜨지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("생년월일")).toHaveValue("2002-03-14");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "세린" }).click();
  await page.getByRole("button", { name: "세린으로 시작" }).click();
  // 트윈 고르기에도 「건너뛰기」 가 있어, 스타일 단계가 뜬 뒤에 누른다.
  await expect(page.getByRole("heading", { name: "좋아하는 스타일을 골라 주세요" })).toBeVisible();
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // 웹 그림은 이름 붙은 바깥 상자와 안쪽 img 태그 둘로 그려진다. 같은 그림이라 첫째를 본다.
  const stage = page.getByRole("img", { name: "세린 기본 코디" }).first();
  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await expect(stage).toBeVisible();
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("1 / 2");
  await expect(tour).toContainText(
    "여기를 누르면 옷을 골라 트윈에 입혀요. 겹쳐 입혀 보기는 늘 무료예요",
  );
  await tour.getByRole("button", { name: "다음" }).click();
  await expect(tour).toContainText("2 / 2");
  await expect(tour).toContainText("AI 완성 룩 사진을 만들어요");
  await expect(tour.getByRole("button", { name: "건너뛰기" })).toHaveCount(0);
  await expect(tour.getByRole("button", { name: "내 옷 추가" })).toBeVisible();
  await tour.getByRole("button", { name: "시작하기" }).click();
  await expect(tour).toHaveCount(0);

  await page.reload();
  await expect(stage).toBeVisible();
  await expect(tour).toHaveCount(0);
});

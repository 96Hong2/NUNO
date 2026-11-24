import { expect, test } from "@playwright/test";

// 「옷장 판」 의 주 흐름. 기대값은 로드맵 T5 DoD(plan_T5 D1~D4, D11)에서 가져온다.
// 빈 저장소에서 연다. 견본 옷은 설치 파일 그림, 내 옷은 e2e/fixtures/garments 견본 사진이다.
test.use({ storageState: { cookies: [], origins: [] } });

const FIXTURES = "e2e/fixtures/garments";

test("생년월일, 하린, 입고 싶은 옷, 「첫 코디」 룩북 저장, 옷 넣기, 입혀 보기, 「내 코디」 저장까지 이어진다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "하린" }).click();
  await page.getByRole("button", { name: "하린으로 시작" }).click();
  await page.getByRole("button", { name: "나중에 고를게요" }).click();

  await expect(page.getByText("신발과 가방은 고른 옷에 맞춰 채워 드려요")).toBeVisible();
  await page.getByRole("radio", { name: "케이프 코트" }).click();
  await page.getByRole("radio", { name: "코튼 미니" }).click();
  await page.getByRole("button", { name: "이대로 입히기" }).click();

  await expect(page.getByRole("heading", { name: "완성 룩이에요" })).toBeVisible();
  await expect(page.getByText("AI 가 만든 예시라 실제와 다를 수 있어요")).toBeInViewport();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  const sheet = page.getByRole("dialog", { name: "룩북 저장" });
  await expect(sheet.getByLabel("제목")).toHaveValue("첫 코디");
  await sheet.getByRole("button", { name: "내 룩북에 저장" }).click({ clickCount: 5 });

  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await expect(tour).toContainText("첫 코디를 저장했어요");
  await tour.getByRole("button", { name: "닫기" }).click();
  const card = page.getByRole("button", { name: "첫 코디 룩 보기" });
  await expect(card).toContainText("옷 2벌");
  await expect(card).toContainText("방금 저장");
  await expect(page.getByRole("button", { name: /룩 보기$/ })).toHaveCount(1);

  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
  await page.getByRole("button", { name: "옷 추가" }).last().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles(`${FIXTURES}/knit-stripe.jpg`);
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: /이미 가진 옷/ }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "내 옷에 담기" }).click();
  await page.getByRole("alert").getByRole("button", { name: "이 옷으로 코디하기" }).click();

  await expect(page.getByTestId("stage-piece")).not.toHaveCount(0);
  await page.getByRole("button", { name: "내 코디" }).click();
  const my = page.getByRole("dialog", { name: "내 코디" });
  await expect(my.getByRole("button", { name: "첫 코디 입히기" })).toHaveCount(1);
  await my.getByRole("button", { name: "지금 코디 담기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("내 코디에 저장했어요 2/5");
});

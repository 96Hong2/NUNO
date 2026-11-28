import { expect, test, type Page } from "@playwright/test";

// 기대값은 로드맵 T4 DoD(plan_T4 D1, D5, D7, D8, D9, D14)에서 가져온다. 옷은 설치 파일의 견본 옷이다.
const card = (page: Page, name: string) =>
  page.getByRole("list", { name: "옷 목록" }).getByRole("button", { name, exact: true });

async function openCoordi(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
}

test("견본 아우터를 누르면 입고 다시 누르면 벗고, 모두 벗기기는 되돌리기로 돌아온다", async ({
  page,
}) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      outside.push(request.url());
  });
  await openCoordi(page);
  await page.getByRole("button", { name: "입은 옷 모두 벗기" }).click();
  await expect(page.getByRole("alert")).toContainText("입은 옷을 모두 벗었어요");
  await page.getByRole("alert").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByRole("img", { name: "코디를 입은 트윈 사진" }).first()).toBeVisible();

  await page.getByRole("button", { name: "입은 옷 모두 벗기" }).click();
  const coat = card(page, "그레이 더블 울 하프코트");
  await coat.click();
  await expect(coat).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "무대의 그레이 더블 울 하프코트" })).toBeVisible();
  await coat.click();
  await expect(coat).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
  expect(outside).toEqual([]);
});

test("코디를 바꾸면 최근 줄 맨 앞에 「입는 중」 이 붙고 새로고침해도 남으며, 내 코디 첫 칸에 담긴다", async ({
  page,
}) => {
  await openCoordi(page);
  await page.getByRole("button", { name: "추천 코디", exact: true }).click();
  await page.getByRole("list", { name: "추천 코디" }).getByRole("button").nth(1).click();
  await expect(page.getByRole("alert")).toContainText("코디로 바꿨어요");

  await page.getByRole("button", { name: "최근 입혀 본 코디", exact: true }).click();
  const recent = page.getByRole("list", { name: "최근 입혀 본 코디" }).getByRole("button");
  await expect(recent.first()).toHaveAccessibleName(/입는 중$/);
  const name = await recent.first().getAttribute("aria-label");
  await page.reload();
  await expect(recent.first()).toHaveAccessibleName(name ?? "");

  await page.getByRole("button", { name: "내 코디" }).click();
  const sheet = page.getByRole("dialog", { name: "내 코디" });
  await sheet.getByRole("button", { name: "지금 코디 담기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("내 코디에 저장했어요 1/5");
  await expect(sheet.getByRole("button", { name: /코디 입히기$/ })).toHaveCount(1);
});

test("무대 「내 옷으로 추천」 은 범위 창 없이 옷장에 있는 옷에서 고르고, 스토어 범위는 없다", async ({
  page,
}) => {
  await openCoordi(page);
  await page.getByRole("button", { name: "내 옷으로 추천" }).click();
  await expect(page.getByRole("dialog", { name: "추천 범위" })).toHaveCount(0);
  const panel = page.getByRole("region", { name: "지금 코디에 어울리는 옷" });
  await expect(panel).toContainText("내 옷장에서 골랐어요");
  await expect(page.getByText(/찜한 스토어 옷|스토어 전체/)).toHaveCount(0);
});

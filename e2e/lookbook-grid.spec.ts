import { expect, test, type Page } from "@playwright/test";
import { lookbookWith, saveLooks, signInWithGold } from "./server-looks";

// 룩북 전체 보기(격자). 기대값은 로드맵 DoD 문장과 와이어프레임 v28 「S20 룩북 전체 보기」 글자,
// 칸 폭 규칙(가로 88 이상으로 폭을 채우는 격자, 사이 2)에서 가져온다.

const FIRST = { key: "w21", name: "그레이 더블 울 하프코트", category: "outer" };
const SECOND = { key: "w06", name: "블랙 시어링 무스탕 자켓", category: "outer" };
const THIRD = { key: "w36", name: "라벤더 후드 숏패딩", category: "outer" };
const WIDTH = 390;

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true, level: 1 });
const grid = (page: Page) => page.getByTestId("lookbook-grid");
const tiles = (page: Page) => grid(page).getByRole("button", { name: /^\d+번째 룩, / });
const bookButton = (page: Page, name: string) =>
  page.getByTestId("lookbook-book").getByRole("button", { name, exact: true });

async function openShelf(page: Page) {
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "룩북" }).click();
}

test("룩 크게 보기의 「전체 보기」 는 그 룩북의 격자를 열고, 칸을 누르면 그 룩이 크게 열리며 다시 누르면 격자로 돌아간다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: WIDTH, height: 844 });
  const token = await signInWithGold(page, 12);
  const [first, , third] = await saveLooks(page, token, [FIRST, SECOND, THIRD]);
  await lookbookWith(page, token, "겨울 여행", [first ?? "", third ?? ""]);
  await page.reload();

  // 「모든 룩」 은 최근 저장 순이다. 크게 보기 첫 장은 셋째로 저장한 룩이다.
  await openShelf(page);
  await page.getByRole("button", { name: /^모든 룩 룩북 보기/ }).click();
  await expect(heading(page, "모든 룩")).toBeVisible();
  await bookButton(page, "전체 보기").click();

  await expect(heading(page, "모든 룩 전체 보기")).toBeVisible();
  await expect(grid(page).getByText("룩 3개", { exact: true })).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toHaveAccessibleName(`1번째 룩, ${THIRD.name}`);
  await expect(tiles(page).nth(1)).toHaveAccessibleName(`2번째 룩, ${SECOND.name}`);
  await expect(tiles(page).nth(2)).toHaveAccessibleName(`3번째 룩, ${FIRST.name}`);
  await expect(grid(page).getByText("룩 3개를 모두 봤어요", { exact: true })).toBeVisible();

  // 390 폭에서는 한 줄에 네 칸이다: 칸 폭은 (390 - 사이 2 x 3) / 4, 셋이 같은 줄에 왼쪽부터 놓인다.
  const boxes = await Promise.all([0, 1, 2].map((i) => tiles(page).nth(i).boundingBox()));
  const [a, b, c] = boxes;
  expect(a && b && c).toBeTruthy();
  if (a && b && c) {
    expect(a.width).toBeCloseTo((WIDTH - 2 * 3) / 4, 0);
    expect(b.y).toBeCloseTo(a.y, 0);
    expect(c.y).toBeCloseTo(a.y, 0);
    expect(b.x).toBeCloseTo(a.x + a.width + 2, 0);
    expect(c.x).toBeCloseTo(b.x + b.width + 2, 0);
  }

  // 둘째 칸을 누르면 그 룩이 크게 열린다.
  await tiles(page).nth(1).click();
  await expect(heading(page, "모든 룩")).toBeVisible();
  await expect(
    page.getByTestId("lookbook-book").last().getByText(SECOND.name, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("lookbook-book").last().getByText("2 / 3")).toBeVisible();

  // 다시 「전체 보기」 를 누르면 같은 격자로 돌아간다. 격자와 크게 보기 화면이 한 장씩 더 쌓이지 않는다.
  await page
    .getByTestId("lookbook-book")
    .last()
    .getByRole("button", { name: "전체 보기", exact: true })
    .click();
  await expect(heading(page, "모든 룩 전체 보기")).toBeVisible();
  await expect(grid(page)).toHaveCount(1);
  await expect(page.getByTestId("lookbook-book")).toHaveCount(1);

  // 격자에서 「뒤로」 를 누르면 처음 연 「모든 룩」 크게 보기, 한 번 더 누르면 책장이다.
  await grid(page).getByRole("button", { name: "뒤로" }).click();
  await expect(heading(page, "모든 룩")).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  await page.getByTestId("lookbook-book").getByRole("button", { name: "뒤로" }).click();
  await expect(page.getByTestId("lookbook-book")).toHaveCount(0);

  // 룩 일부만 담은 「겨울 여행」 의 격자에는 그 룩북의 룩만 있다.
  await page.getByRole("button", { name: /^겨울 여행 룩북 보기/ }).click();
  await expect(heading(page, "겨울 여행")).toBeVisible();
  await bookButton(page, "전체 보기").click();
  await expect(heading(page, "겨울 여행 전체 보기")).toBeVisible();
  await expect(grid(page).getByText("룩 2개", { exact: true })).toBeVisible();
  await expect(tiles(page)).toHaveCount(2);
  await expect(tiles(page).nth(0)).toHaveAccessibleName(`1번째 룩, ${THIRD.name}`);
  await expect(tiles(page).nth(1)).toHaveAccessibleName(`2번째 룩, ${FIRST.name}`);
  await expect(grid(page).getByRole("button", { name: new RegExp(SECOND.name) })).toHaveCount(0);
  await expect(grid(page).getByText("룩 2개를 모두 봤어요", { exact: true })).toBeVisible();
});

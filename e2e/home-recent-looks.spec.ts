import { expect, test } from "@playwright/test";
import { saveLooks, signInWithGold } from "./server-looks";

// 홈 「최근 저장한 룩」. 기대값은 로드맵 DoD 문장: 저장한 룩이 9개면 최신 8개만 2열로 보인다.
// 룩 아홉은 API 로 만들어 저장하고, 판정은 홈 화면에서 한다.

const WEARS = [
  { key: "w21", name: "그레이 더블 울 하프코트", category: "outer" },
  { key: "w06", name: "블랙 시어링 무스탕 자켓", category: "outer" },
  { key: "w36", name: "라벤더 후드 숏패딩", category: "outer" },
  { key: "w02", name: "아이보리 퍼 칼라 벨티드 롱패딩", category: "outer" },
  { key: "w07", name: "베이지 골지 터틀넥 니트", category: "top" },
  { key: "w08", name: "블랙 울 H라인 롱스커트", category: "bottom" },
  { key: "w12", name: "스카이블루 퍼 크롭 자켓", category: "outer" },
  { key: "w18", name: "아이보리 케이프 벨티드 코트", category: "outer" },
  { key: "w30", name: "오트밀 울 후드 더플코트", category: "outer" },
];

test("저장한 룩이 9개면 홈 「최근 저장한 룩」 에 최신 8개만 2열로 보인다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const token = await signInWithGold(page, 4 * WEARS.length);
  await saveLooks(page, token, WEARS);
  await page.reload();

  await page.getByRole("button", { name: "최근 저장한 룩" }).click();
  await expect(page.getByText("저장한 룩 9개", { exact: true })).toBeVisible();
  const cards = page.getByRole("button", { name: / 룩 보기$/ });
  await expect(cards).toHaveCount(8);
  // 맨 처음 저장한 룩만 빠지고, 나머지 여덟은 최근 저장 순이다.
  await expect(page.getByRole("button", { name: `${WEARS[0]?.name} 룩 보기` })).toHaveCount(0);
  const newestFirst = WEARS.slice(1).reverse();
  for (const [index, wear] of newestFirst.entries()) {
    await expect(cards.nth(index)).toHaveAccessibleName(`${wear.name} 룩 보기`);
  }

  // 2열: 카드 왼쪽 끝 x 값이 두 가지이고, 한 줄에 두 장씩 네 줄이다.
  const boxes = await Promise.all(newestFirst.map((_, index) => cards.nth(index).boundingBox()));
  const lefts = new Set(boxes.map((box) => Math.round(box?.x ?? -1)));
  const tops = new Set(boxes.map((box) => Math.round(box?.y ?? -1)));
  expect(lefts.size).toBe(2);
  expect(tops.size).toBe(4);
});

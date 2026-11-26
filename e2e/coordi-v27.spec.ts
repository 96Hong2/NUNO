import { expect, test, type Locator, type Page } from "@playwright/test";

// 코디 무대 단추, 「내 옷으로 추천」, 옷 종류 칩 체크, 옷 칸을 올린 상태.
// 기대값은 plan_W27.md DoD W15~W17 과 시안 v2 명세 2(피팅룸 코디 무대)에서 가져온다. 크기는 기준 틀 390×844 에서 잰다.
test.use({ viewport: { width: 390, height: 844 } });

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("요소가 화면에 그려지지 않았어요");
  return rect;
};

const garmentList = (page: Page) => page.getByRole("list", { name: "옷 목록" });

async function openCoordi(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
}

test("W15: 무대에 「모두 벗기기」 와 「내 옷으로 추천」 이 있고 확대 단추가 없으며, ↶ ↷ 는 「전체, 즐겨찾기」 줄 오른쪽에 있다", async ({
  page,
}) => {
  await openCoordi(page);
  const stage = await box(page.getByTestId("coordi-stage"));
  expect(Math.round(stage.height)).toBe(308);

  const undress = page.getByRole("button", { name: "입은 옷 모두 벗기" });
  await expect(undress).toHaveText("모두 벗기기");
  await expect(page.getByRole("button", { name: "내 옷으로 추천" })).toBeVisible();
  await expect(page.getByRole("button", { name: "트윈 확대" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "트윈 축소" })).toHaveCount(0);
  await expect(page.getByText("＋", { exact: true })).toHaveCount(0);
  await expect(page.getByText("−", { exact: true })).toHaveCount(0);
  await expect(page.getByText("옷 비우기", { exact: true })).toHaveCount(0);
  await expect(page.getByText("💡 추천 코디", { exact: true })).toHaveCount(0);

  // 트윈 얼굴 원 48 은 왼쪽 위 16, 12 에 있다.
  const face = await box(page.getByRole("button", { name: /트윈 메뉴 열기$/ }));
  expect(Math.round(face.width)).toBe(48);
  expect(Math.round(face.x)).toBe(16);
  expect(Math.round(face.y - stage.y)).toBe(12);

  // ↶ ↷ 는 무대 밖 옷 칸의 「전체, 즐겨찾기」 줄에 있고, 「즐겨찾기」 보다 오른쪽 끝에 붙는다.
  const all = await box(page.getByRole("button", { name: "전체", exact: true }));
  const favorite = await box(page.getByRole("button", { name: "즐겨찾기", exact: true }));
  const undo = await box(page.getByRole("button", { name: "이전 코디" }));
  const redo = await box(page.getByRole("button", { name: "다음 코디" }));
  expect(undo.y).toBeGreaterThan(stage.y + stage.height - 20);
  for (const rect of [favorite, undo, redo]) {
    expect(Math.abs(rect.y + rect.height / 2 - (all.y + all.height / 2))).toBeLessThanOrEqual(2);
  }
  expect(undo.x).toBeGreaterThan(favorite.x + favorite.width);
  expect(Math.round(redo.x + redo.width)).toBe(374);
  expect(Math.round(undo.width)).toBe(44);

  // 「모두 벗기기」 알림은 옷 칸 시트 바로 위, 무대 아랫변에서 84 위에 아랫변이 온다.
  await undress.click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("입은 옷을 모두 벗었어요");
  const toast = await box(alert);
  expect(Math.abs(toast.y + toast.height - (stage.y + stage.height - 84))).toBeLessThanOrEqual(2);
});

test("W16: 「내 옷으로 추천」 을 누르면 범위 창 없이 「지금 코디에 어울리는 옷」 이 열리고 코디 묶음이 접힌다", async ({
  page,
}) => {
  await openCoordi(page);
  await expect(page.getByRole("list", { name: /^(최근 입혀 본 코디|추천 코디)$/ })).toHaveCount(1);

  await page.getByRole("button", { name: "내 옷으로 추천" }).click();
  await expect(page.getByRole("dialog", { name: "추천 범위" })).toHaveCount(0);
  const panel = page.getByRole("region", { name: "지금 코디에 어울리는 옷" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("옷장에 있는 옷에서 골랐어요");
  await expect(page.getByRole("list", { name: "최근 입혀 본 코디", exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "추천 코디", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "최근 입혀 본 코디", exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "추천 닫기" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("list", { name: /^(최근 입혀 본 코디|추천 코디)$/ })).toHaveCount(1);
});

test("W17: 하의를 입히면 칩이 「하의 ✓」 이고 입은 옷이 둘째 칸에 오며, 옷 칸을 올리면 무대 줄 왼쪽에 작은 「이대로 입히기」 가 있다", async ({
  page,
}) => {
  await openCoordi(page);
  await page.getByRole("button", { name: "입은 옷 모두 벗기" }).click();
  await expect(page.getByRole("alert")).toContainText("입은 옷을 모두 벗었어요");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
  await expect(page.getByTestId("worn-check")).toHaveCount(0);

  await page.getByRole("button", { name: "하의", exact: true }).click();
  // 첫 칸은 「옷 추가」, 그 뒤가 옷이다. 둘째 옷(셋째 칸)을 입힌다.
  const cells = garmentList(page).getByRole("button");
  await expect(cells.first()).toHaveAccessibleName("옷장에 옷 추가");
  await expect(cells.first()).toHaveText("+옷 추가");
  const second = cells.nth(2);
  const name = (await second.getAttribute("aria-label")) ?? "";
  expect(name).not.toBe("");
  await second.click();

  // 칩 글자 뒤 체크, 입은 옷은 「옷 추가」 바로 뒤 칸, 처음 입힌 직후 안내
  const chip = page.getByRole("button", { name: "하의, 입은 옷 있음" });
  await expect(chip).toBeVisible();
  await expect(chip.getByTestId("worn-check")).toBeVisible();
  expect(Math.round((await box(chip)).height)).toBe(36);
  const worn = cells.nth(1);
  await expect(worn).toHaveAccessibleName(name);
  await expect(worn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("옷을 누르면 빠져요", { exact: true })).toBeVisible();
  await expect(page.getByText("옷을 누르면 빠져요", { exact: true })).toHaveCount(0, {
    timeout: 5000,
  });

  // 옷 칸 카드는 네 열, 390 폭에서 한 칸이 84 쯤이다.
  const add = await box(cells.first());
  expect(Math.abs(add.width - 84)).toBeLessThanOrEqual(1);

  // 손잡이를 누르면 옷 칸이 올라온다. 작은 무대 줄 80 의 왼쪽에 작은 「이대로 입히기」, 오른쪽에 「트윈 크게 보기」
  await page.getByRole("button", { name: "옷 칸 크게 올리기" }).click();
  const back = page.getByRole("button", { name: "트윈 크게 보기", exact: true });
  await expect(back).toBeVisible();
  const mini = await box(page.getByTestId("coordi-stage"));
  expect(Math.round(mini.height)).toBe(80);
  const make = page.getByRole("button", { name: "이대로 입히기" });
  await expect(make).toBeVisible();
  const makeBox = await box(make);
  expect(Math.round(makeBox.x)).toBe(16);
  expect(Math.round(makeBox.height)).toBe(36);
  expect(makeBox.x + makeBox.width).toBeLessThan((await box(back)).x);
  await expect(page.getByRole("list", { name: /^(최근 입혀 본 코디|추천 코디)$/ })).toHaveCount(0);

  await back.click();
  await expect(page.getByRole("button", { name: "내 옷으로 추천" })).toBeVisible();
  expect(Math.round((await box(page.getByTestId("coordi-stage"))).height)).toBe(308);
});

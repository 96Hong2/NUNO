import { expect, test, type Page } from "@playwright/test";

// 완성 룩을 만든 뒤 무대와 룩북에서 다시 쓰는 흐름. 기대값은 와이어프레임 v26 실측(룩북 크게 보기,
// 입은 옷 시트, 시트가 열리면 알림이 화면 위 56px 로 뜨는 규칙)과 plan_T7 「구현 중 바뀐 것」 에서 가져온다.

const API_URL = `http://localhost:${process.env.NUNO_E2E_API_PORT ?? 8877}`;
const COAT = "그레이 더블 울 하프코트";

const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem("nuno.session-token") ?? "");

async function dev(page: Page, path: string, body: object) {
  const response = await page.request.post(`${API_URL}/v1/dev/${path}`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
    data: body,
  });
  expect(response.ok()).toBe(true);
}

const toast = (page: Page) => page.getByRole("alert");
const stageButton = (page: Page) => page.getByRole("button", { name: "이대로 입히기" });
const makeSheet = (page: Page) => page.getByRole("dialog", { name: "완성 룩 만들기" });
/** 룩북 크게 보기 화면 안에서 찾는다. 뒤에 남은 탭 화면에 같은 이름의 단추가 있다 */
const bookButton = (page: Page, name: string) =>
  page.getByTestId("lookbook-book").getByRole("button", { name, exact: true });
const coatCard = (page: Page) =>
  page.getByRole("list", { name: "옷 목록" }).getByRole("button", { name: COAT, exact: true });

async function stripStage(page: Page) {
  await page.getByRole("button", { name: "옷 비우기" }).click();
  await expect(toast(page)).toContainText("옷을 모두 비웠어요");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
}

async function saveResultAndBack(page: Page) {
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();
}

async function openAllLooks(page: Page) {
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "룩북" }).click();
  await page.getByRole("button", { name: /^모든 룩 룩북 보기/ }).click();
  await expect(page.getByRole("heading", { name: "모든 룩" })).toBeVisible();
}

test("무대에 머물러도 「다 된 완성 룩 보기」 가 남고, 알림은 시트 위로 비키며, 룩북 크게 보기에서 입은 옷을 다시 입힌다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await stripStage(page);
  await coatCard(page).click();
  // 코트가 무대에 오르기 전에 누르면 「옷을 담으면 만들 수 있어요」 만 뜬다.
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "완성 룩을 만들려면 가입이 필요해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await expect(
    page.getByRole("heading", { name: "완성 룩을 만들기 전에 확인해 주세요" }),
  ).toBeVisible();
  await dev(page, "provider", { mode: "succeed", delayMs: 3000 });
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();

  // 만드는 중에 닫고 무대에 머문다. 끝남 알림이 사라진 뒤에도 무대 알약이 남아 있다.
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(toast(page)).toContainText("완성 룩이 나왔어요", { timeout: 20_000 });
  const chip = page.getByRole("button", { name: "다 된 완성 룩 보기" });
  await expect(chip).toBeVisible();
  await expect(toast(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(chip).toBeVisible();
  await chip.click();
  await saveResultAndBack(page);

  // 「…코디로 바꿨어요」 알림이 떠 있는 채로 시트를 열면 알림이 화면 위로 올라가고 시트 단추가 눌린다.
  await page.getByRole("button", { name: "추천 코디", exact: true }).click();
  await page.getByRole("list", { name: "추천 코디" }).getByRole("button").first().click();
  await expect(toast(page)).toContainText("코디로 바꿨어요");
  await stageButton(page).click();
  await expect(makeSheet(page)).toBeVisible();
  await expect(toast(page)).toContainText("코디로 바꿨어요");
  const toastBox = await toast(page).boundingBox();
  const sheetBox = await makeSheet(page).boundingBox();
  expect(toastBox && sheetBox && toastBox.y + toastBox.height <= sheetBox.y).toBe(true);
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await saveResultAndBack(page);

  // 룩북 크게 보기: 첫 장은 코트 한 벌로 만든 룩이다. 옷걸이 알약으로 입은 옷 시트를 열어 담고 입힌다.
  await stripStage(page);
  await openAllLooks(page);
  await bookButton(page, "다음 룩").click();
  await expect(page.getByTestId("lookbook-book").getByText(COAT, { exact: true })).toBeVisible();
  await expect(bookButton(page, "전체 보기")).toBeVisible();
  await bookButton(page, "입은 옷 1벌 보기").click();
  const worn = page.getByRole("dialog", { name: "입은 옷 1개" });
  await expect(worn).toContainText(COAT);
  await worn.getByRole("checkbox", { name: `${COAT} 고르기` }).click();
  await worn.getByRole("button", { name: "옷장에 담기 1" }).click();
  await expect(toast(page)).toContainText("1벌을 옷장에 담았어요");
  await expect(worn).toContainText("옷장에 있음");
  // 담고 나면 고른 줄이 풀린다. 다시 골라 입힌다.
  await worn.getByRole("checkbox", { name: `${COAT} 고르기` }).click();
  await worn.getByRole("button", { name: "트윈에 입혀 보기 1" }).click();
  await expect(toast(page)).toContainText("1벌을 트윈에 입혔어요");
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();

  // 아래 고정 줄 「트윈에 입혀 보기」 는 룩 전체를 입히고, 「전체 보기」 는 그 룩북의 격자를 연다.
  await stripStage(page);
  await openAllLooks(page);
  await bookButton(page, "다음 룩").click();
  await expect(page.getByTestId("lookbook-book").getByText(COAT, { exact: true })).toBeVisible();
  await bookButton(page, "트윈에 입혀 보기").click();
  await expect(toast(page)).toContainText("트윈에 입혔어요");
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
  await openAllLooks(page);
  await bookButton(page, "전체 보기").click();
  await expect(page.getByRole("heading", { name: "모든 룩 전체 보기", exact: true })).toBeVisible();
  await expect(
    page.getByTestId("lookbook-grid").getByText("룩 2개", { exact: true }),
  ).toBeVisible();
});

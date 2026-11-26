import { expect, test, type Locator, type Page } from "@playwright/test";

// 홈 무대 원형 단추, 시트 떠 있는 단추, 빈 칸의 추천 코디 줄.
// 기대값은 plan_W27.md DoD W1~W6 과 시안 v2 명세 「1. 홈」 에서 가져온다. 크기는 기준 틀 390×844 에서 잰다.
test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("요소가 화면에 그려지지 않았어요");
  return rect;
};

const recoList = (page: Page) => page.getByRole("list", { name: "홈 추천 코디" });

/** 빈 저장소에서 생년월일, 하린, 「건너뛰기」 로 온보딩을 넘기고 둘러보기를 닫는다. 룩도 옷도 없다. */
async function skipOnboardingAsHarin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "하린" }).click();
  await page.getByRole("button", { name: "하린으로 시작" }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await tour.getByRole("button", { name: "닫기" }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("img", { name: "하린 기본 코디" }).first()).toBeVisible();
}

test("룩이 없으면 「최근 저장한 룩」 칸에 추천 코디 줄이 보이고, 카드를 누르면 코디 탭에서 그 코디를 입는다", async ({
  page,
}) => {
  await skipOnboardingAsHarin(page);

  // W1: 빈 안내 글 대신 머리 줄과 「NUNO 추천」 카드 가로 줄
  await expect(page.getByRole("button", { name: "최근 저장한 룩" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("온보딩에서 저장한 첫 코디가 여기에 보여요", { exact: false })).toHaveCount(0);
  await expect(page.getByText("추천 코디", { exact: true })).toBeVisible();
  await expect(page.getByText("NUNO가 고른 코디예요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "코디하러 가기" })).toBeVisible();
  const cards = recoList(page).getByRole("button");
  await expect(cards.first()).toContainText("NUNO 추천");
  const first = await box(cards.first());
  expect(Math.round(first.x)).toBe(16);
  expect(Math.round(first.width)).toBe(104);

  // W2: 무대 트윈 하린의 기본 코디는 줄에 없다
  await expect(
    recoList(page).getByRole("button", { name: /^차콜 더플 코트와 플리츠 미니/ }),
  ).toHaveCount(0);
  await expect(cards.first()).toContainText("그레이 더블 코트와 블랙 초미니");

  // W3: 첫 카드를 누르면 피팅룸 코디 탭이 열리고 그 코디 사진이 무대에 선다. 「되돌리기」 로 기본 코디에 돌아온다.
  await cards.first().click();
  await expect(page).toHaveURL(/\/fitting\/coordi$/);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("그레이 더블 코트와 블랙 초미니 코디로 바꿨어요");
  const stagePhoto = page.getByRole("img", { name: "코디를 입은 트윈 사진" }).first().locator("img");
  await expect(stagePhoto).toHaveAttribute("src", /harin-co/);
  await alert.getByRole("button", { name: "되돌리기" }).click();
  await expect(stagePhoto).toHaveAttribute("src", /harin-p07/);
});

test("옷이 없으면 「최근 추가한 옷」 칸에도 추천 코디 줄과 「+ 옷 추가」 가 보이고, 누르면 옷 추가 시트가 열린다", async ({
  page,
}) => {
  await skipOnboardingAsHarin(page);

  // W4
  await page.getByRole("button", { name: "최근 추가한 옷" }).click();
  await expect(page.getByRole("button", { name: "최근 추가한 옷" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(recoList(page).getByRole("button").first()).toContainText("NUNO 추천");
  // 빈 칸에서는 떠 있는 「+ 옷 추가」 를 숨기고 머리 줄 글자 단추 하나만 둔다.
  await expect(page.getByText("+ 옷 추가", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "옷 추가", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "옷을 어떻게 추가할까요?" })).toBeVisible();
});

test("홈 무대 왼쪽에 「트윈 바꾸기」, 「오늘 추천」, 「룩북」, 오른쪽에 잉크색 원 「코디」 가 있고, 「룩북」 은 룩북 탭을 연다", async ({
  page,
}) => {
  await skipOnboardingAsHarin(page);

  // W5: 원 48, 왼쪽 열 가운데 x48, 오른쪽 열 가운데 x342
  for (const name of ["트윈 바꾸기", "오늘 추천", "룩북"]) {
    const button = await box(page.getByRole("button", { name, exact: true }));
    expect(Math.round(button.x + button.width / 2)).toBe(48);
  }
  const coordi = await box(page.getByRole("button", { name: "코디", exact: true }));
  expect(Math.round(coordi.x + coordi.width / 2)).toBe(342);
  const ink = page.getByTestId("stage-coordi-circle");
  await expect(ink).toHaveCSS("background-color", "rgb(21, 19, 20)");
  const circle = await box(ink);
  expect(Math.round(circle.width)).toBe(48);
  await expect(page.getByRole("button", { name: "트윈 꾸미기" })).toHaveCount(0);

  await page.getByRole("button", { name: "룩북", exact: true }).click();
  await expect(page).toHaveURL(/\/fitting\/lookbook$/);
  await expect(
    page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "룩북" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("룩이 있으면 시트를 올렸을 때만 「+ 코디하기」 가 보인다", async ({ page }) => {
  // 온보딩 4단계에서 첫 코디를 룩북에 저장해 룩 한 장을 만든다.
  await page.goto("/");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "하린" }).click();
  await page.getByRole("button", { name: "하린으로 시작" }).click();
  await page.getByRole("button", { name: "나중에 고를게요" }).click();
  await page.getByRole("radio", { name: "케이프 코트" }).click();
  await page.getByRole("radio", { name: "코튼 미니" }).click();
  await page.getByRole("button", { name: "이대로 입히기" }).click();
  await expect(page.getByRole("img", { name: "트윈이 고른 옷을 입은 사진" }).first()).toBeVisible();
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  const sheet = page.getByRole("dialog", { name: "룩북 저장" });
  await sheet.getByRole("button", { name: "내 룩북에 저장" }).click();
  const tour = page.getByRole("dialog", { name: "처음 둘러보기" });
  await tour.getByRole("button", { name: "닫기" }).click();
  await expect(tour).toHaveCount(0);

  // W6
  await expect(page.getByText("저장한 룩 1개")).toBeVisible();
  const floating = page.getByRole("button", { name: "+ 코디하기" });
  await expect(floating).toHaveCount(0);
  await page.getByRole("button", { name: "최근 저장한 룩" }).click();
  await expect(floating).toBeVisible();
  const pill = await box(floating);
  expect(Math.round(pill.height)).toBe(48);
  expect(Math.round(390 - (pill.x + pill.width))).toBe(16);

  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, -3000);
  await expect(floating).toHaveCount(0);
});

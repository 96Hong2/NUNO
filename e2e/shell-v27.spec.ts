import { expect, test, type Locator, type Page } from "@playwright/test";

// 기대값은 와이어프레임 v27 의 공통 틀(하단 탭, 머리 줄, 온보딩 트윈)과 시안 v2 명세(온보딩 트윈, 팔레트)에서 가져온다.
// 크기는 와이어프레임 기준 틀 390×844 에서 잰다.
test.use({ viewport: { width: 390, height: 844 } });

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("요소가 화면에 그려지지 않았어요");
  return rect;
};

const header = (page: Page) => page.locator("h1:not([inert] *)");

test.describe("빈 저장소의 온보딩", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("트윈 고르기에 「1 / 4」 와 설명 두 줄이 있고, 종류를 바꾸거나 「‹」 로 돌아와도 고른 트윈과 옷이 남는다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "다음" }).click();

    await expect(
      page.getByRole("heading", { name: "옷을 입어 볼 트윈을 골라 주세요" }),
    ).toBeVisible();
    await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
    await expect(page.getByText("트윈은 나 대신 옷을 입어 볼 가상 모델이에요")).toBeVisible();
    await expect(page.getByText("나중에 피팅룸 트윈 탭에서 바꿀 수 있어요")).toBeVisible();
    await expect(page.getByText("몸 치수는 받지 않아요")).toBeVisible();
    await expect(page.getByRole("button", { name: "트윈을 골라 주세요" })).toBeVisible();

    const harin = page.getByRole("radio", { name: "하린" });
    const photo = await box(harin);
    expect(Math.round(photo.width)).toBe(169);
    await harin.click();
    await expect(harin).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "인형" }).click();
    await expect(page.getByRole("radio", { name: "모아" })).toBeVisible();
    await expect(page.getByRole("button", { name: "하린으로 시작" })).toBeVisible();
    await page.getByRole("button", { name: "실사" }).click();
    await expect(harin).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "하린으로 시작" }).click();
    await expect(
      page.getByRole("heading", { name: "좋아하는 스타일을 골라 주세요" }),
    ).toBeVisible();
    await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "이전 단계" }).click();
    await expect(harin).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "하린으로 시작" }).click();
    await page.getByRole("button", { name: "나중에 고를게요" }).click();
    await expect(page.getByText("3 / 4", { exact: true })).toBeVisible();
    const coat = page.getByRole("radio", { name: "케이프 코트" });
    await coat.click();
    await page.getByRole("radio", { name: "코튼 미니" }).click();
    await page.getByRole("button", { name: "이대로 입히기" }).click();

    await expect(page.getByRole("heading", { name: "완성 룩이에요" })).toBeVisible();
    await expect(page.getByText("4 / 4", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "이전 단계" }).click();
    await expect(coat).toHaveAttribute("aria-checked", "true");

    // 공통 시트 틀: 제목 20px 700, X 누르는 영역 44.
    await page.getByRole("button", { name: "이대로 입히기" }).click();
    // 「트윈에 입히고 있어요」 동안에는 저장 단추가 눌리지 않는다. 사진이 뜬 뒤 누른다.
    await expect(
      page.getByRole("img", { name: "트윈이 고른 옷을 입은 사진" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "내 룩북에 저장" }).click();
    const sheet = page.getByRole("dialog", { name: "룩북 저장" });
    await expect(sheet.getByRole("heading", { name: "룩북 저장" })).toHaveCSS("font-size", "20px");
    await expect(sheet.getByRole("heading", { name: "룩북 저장" })).toHaveCSS("font-weight", "700");
    const close = await box(sheet.getByRole("button", { name: "닫기" }));
    expect(Math.round(close.width)).toBe(44);
    expect(Math.round(close.height)).toBe(44);
    await sheet.getByRole("button", { name: "닫기" }).click();
    await expect(sheet).toHaveCount(0);
  });
});

test("하단 탭 「홈」, 「마이」 는 아이콘과 11px 이름이고, 「피팅룸」 은 탭 막대 위로 20 솟은 트윈 얼굴 원이다", async ({
  page,
}) => {
  await page.goto("/");
  const home = page.getByRole("tab", { name: "홈", exact: true });
  const fitting = page.getByRole("tab", { name: "피팅룸", exact: true });
  const my = page.getByRole("tab", { name: "마이", exact: true });
  await expect(home.getByTestId("홈 아이콘").first()).toBeVisible();
  await expect(my.getByTestId("마이 아이콘").first()).toBeVisible();
  await expect(home.getByText("홈", { exact: true })).toHaveCSS("font-size", "11px");

  const face = fitting.getByTestId("피팅룸 트윈 얼굴").first();
  await expect(face).toBeVisible();
  const circle = await box(face);
  expect(Math.round(circle.width)).toBe(52);
  const bar = await box(page.getByRole("tablist").filter({ has: fitting }));
  expect(Math.round(bar.y - circle.y)).toBe(20);
});

test("피팅룸 머리 줄의 「피팅룸」 은 22px 이고, 옷장 칸의 「+ 옷 추가」 는 높이 40 알약이다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸", exact: true }).click();
  await expect(header(page)).toHaveText("피팅룸");
  await expect(header(page)).toHaveCSS("font-size", "22px");

  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
  const add = page.getByRole("button", { name: "옷 추가", exact: true }).first();
  const pill = await box(add);
  expect(Math.round(pill.height)).toBe(40);
});

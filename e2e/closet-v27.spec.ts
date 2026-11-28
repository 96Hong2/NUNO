import { expect, test, type Page } from "@playwright/test";

// 기대값은 와이어프레임 v27 의 피팅룸 옷장 화면과 시안 v2 명세 3(옷장)에서 가져온다.
test.use({ viewport: { width: 390, height: 844 } });

const FIXTURES = "e2e/fixtures/garments";
const KNIT = "스트라이프 니트";
const SKIRT = "블랙 H라인 스커트";

const segment = (page: Page, label: "내 옷" | "담은 옷") =>
  page.getByRole("button", { name: new RegExp(`^${label} \\d+$`) });
const card = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const toast = (page: Page) => page.getByRole("alert");

async function openCloset(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
}

async function addFromAlbum(page: Page, file: string, name: string, wanted: boolean) {
  await openCloset(page);
  await page.getByRole("button", { name: "옷 추가", exact: true }).first().click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog", { name: "옷을 어떻게 추가할까요?" })
    .getByRole("button", { name: "앨범에서 고르기" })
    .click();
  await (await chooser).setFiles(`${FIXTURES}/${file}`);
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "어떤 옷인가요?" })).toBeVisible();
  await page.getByRole("textbox", { name: "이름" }).fill(name);
  if (wanted) await page.getByRole("radio", { name: "사고 싶은 옷" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  const fit = page.getByRole("heading", { name: "트윈에 맞춰 보세요" });
  await expect(fit).toBeVisible();
  await page
    .getByRole("button", { name: wanted ? "담은 옷에 추가" : "내 옷에 추가", exact: true })
    .click();
  await expect(fit).toHaveCount(0);
}

test("옷장이 비면 안내 글만 보이고, 「여러 벌 옮기기」 로 담은 옷을 내 옷으로 옮기며, 「필터」 로 즐겨찾기한 옷만 남긴다", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // 빈 칸: 제목, 설명, 「옷 추가」 하나. 칩 줄과 「필터」 는 숨긴다.
  await openCloset(page);
  await expect(page.getByText("아직 추가한 옷이 없어요")).toBeVisible();
  await expect(page.getByText("옷 사진을 찍거나 앨범에서 골라 옷장에 넣어요")).toBeVisible();
  await expect(page.getByRole("button", { name: /^필터/ })).toHaveCount(0);
  await segment(page, "담은 옷").click();
  await expect(page.getByText("아직 담은 옷이 없어요")).toBeVisible();
  await expect(
    page.getByText("사고 싶은 옷을 모아 두는 칸이에요. 산 옷은 옷 상세에서 내 옷으로 옮겨요"),
  ).toBeVisible();
  await expect(
    page.getByText("사고 싶은 옷 사진을 찍거나 앨범에서 골라 담아 보세요"),
  ).toBeVisible();

  await addFromAlbum(page, "knit-stripe.jpg", KNIT, false);
  await addFromAlbum(page, "hline-skirt.jpg", SKIRT, true);

  // 담은 옷 칸에서 한 벌을 골라 옮긴다. 칸 안 카드에는 「담은 옷」 배지가 없다.
  await openCloset(page);
  await segment(page, "담은 옷").click();
  await expect(card(page, SKIRT)).toBeVisible();
  await expect(card(page, SKIRT).getByText("담은 옷", { exact: true })).toHaveCount(0);
  const addInHeader = page.getByRole("button", { name: "옷 추가", exact: true });
  await expect(addInHeader).toBeVisible();
  await page.getByRole("button", { name: "여러 벌 옮기기" }).click();
  // 옮기는 동안 머리 줄 「+ 옷 추가」 는 숨기고, 옮기기 단추 아래에 피팅룸 얼굴 원이 솟는 자리 28 을 둔다.
  await expect(addInHeader).toHaveCount(0);
  await expect(page.getByText("0벌 골랐어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "옮길 옷을 골라 주세요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "즐겨찾기" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: SKIRT }).click();
  await expect(page.getByText("1벌 골랐어요")).toBeVisible();
  const move = page.getByRole("button", { name: "1벌 내 옷으로 옮기기" });
  const moveBox = await move.boundingBox();
  const tabBar = await page
    .getByRole("tablist")
    .filter({ has: page.getByRole("tab", { name: "피팅룸", exact: true }) })
    .boundingBox();
  // 탭 목록은 탭 막대 윗변 1px 선 아래에서 시작한다. 단추 아래에서 그 선까지가 28 이다.
  const lineTop = (tabBar?.y ?? 0) - 1;
  expect(Math.round(lineTop - ((moveBox?.y ?? 0) + (moveBox?.height ?? 0)))).toBe(28);
  await move.click();
  await expect(toast(page)).toContainText("1벌을 내 옷으로 옮겼어요");
  await expect(toast(page).getByRole("button")).toHaveText(["되돌리기"]);
  await expect(segment(page, "내 옷")).toHaveText(/내 옷 2/);
  await expect(page.getByText("아직 담은 옷이 없어요")).toBeVisible();
  // 옮기기가 끝나면 머리 줄 「+ 옷 추가」 가 돌아온다(빈 칸 안내의 「옷 추가」 와 둘이다).
  await expect(addInHeader).toHaveCount(2);

  // 내 옷 카드 이름 아래 줄. 목록 첫 칸 「옷 추가」 와 「사진 찍기, 앨범」 은 없다.
  await segment(page, "내 옷").click();
  await expect(card(page, KNIT)).toBeVisible();
  await expect(page.getByText("아직 룩에 안 썼어요")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "옷 추가", exact: true })).toHaveCount(1);
  await expect(page.getByText("사진 찍기, 앨범")).toHaveCount(0);

  // 별 하나를 켜고 「즐겨찾기」 필터를 켜면 「필터 1」 이고 별 켠 옷만 남는다.
  await page.getByRole("button", { name: "즐겨찾기", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "즐겨찾기 풀기" })).toHaveCount(1);
  await page.getByRole("button", { name: "필터", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "필터" });
  await expect(sheet.getByRole("switch", { name: "즐겨찾기" })).toBeVisible();
  await expect(sheet.getByRole("switch", { name: "룩에 안 쓴 옷" })).toBeVisible();
  await expect(sheet.getByText("계절", { exact: true })).toBeVisible();
  await sheet.getByRole("switch", { name: "즐겨찾기" }).click();
  await sheet.getByRole("button", { name: "적용" }).click();
  await expect(page.getByRole("button", { name: "필터 1" })).toBeVisible();
  await expect(page.getByText("1벌", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "즐겨찾기", exact: true })).toHaveCount(0);

  // 필터 결과가 0벌이면 「조건에 맞는 옷이 없어요」 와 「필터 초기화」 다. 두 옷 모두 계절을 적지 않았다.
  await page.getByRole("button", { name: "필터 1" }).click();
  await sheet.getByRole("checkbox", { name: "겨울" }).click();
  await sheet.getByRole("button", { name: "적용" }).click();
  await expect(page.getByRole("button", { name: "필터 2" })).toBeVisible();
  await expect(page.getByText("조건에 맞는 옷이 없어요")).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByRole("button", { name: "필터", exact: true })).toBeVisible();
  await expect(card(page, KNIT)).toBeVisible();
  await expect(card(page, SKIRT)).toBeVisible();
});

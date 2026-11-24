import { expect, test, type Page } from "@playwright/test";

// 룩북 여러 권: 즐겨찾기, 「다른 룩북에 넣기」 의 복사와 옮기기. 기대값은 로드맵 T7 DoD(plan_T7 D13~D15)와
// plan 「리뷰 반영」 15 의 시나리오, 와이어프레임 v26 실측 글자에서 가져온다.
// 시험 로그인, 동의, 무료 2장, 시험용 골드 1장으로 완성 룩 셋을 만들어 「모든 룩」 에 저장하고 시작한다.

const API_URL = `http://localhost:${process.env.NUNO_E2E_API_PORT ?? 8877}`;
/** 완성 룩 셋. 입은 옷이 한 벌이라 룩 제목이 옷 이름이다. 「모든 룩」 은 최근 저장 순이라 셋째가 첫 장이다. */
const FIRST = "그레이 더블 울 하프코트";
const SECOND = "블랙 시어링 무스탕 자켓";
const THIRD = "라벤더 후드 숏패딩";

const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem("nuno.session-token") ?? "");

async function dev(page: Page, path: string, body: object) {
  const response = await page.request.post(`${API_URL}/v1/dev/${path}`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
    data: body,
  });
  expect(response.ok()).toBe(true);
}

const stageButton = (page: Page) => page.getByRole("button", { name: "이대로 입히기" });
const makeSheet = (page: Page) => page.getByRole("dialog", { name: "완성 룩 만들기" });
const toast = (page: Page) => page.getByRole("alert");

/** 코디 무대의 옷을 모두 벗기고 그 옷 한 벌만 입힌다. */
async function wearOnly(page: Page, name: string) {
  await page.getByRole("button", { name: "입은 옷 모두 벗기" }).click();
  await page
    .getByRole("list", { name: "옷 목록" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `무대의 ${name}` })).toBeVisible();
}

/** 결과가 오면 「내 룩북에 저장」 하고 무대로 돌아온다. */
async function saveResult(page: Page) {
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();
}

/** 완성 룩 셋을 만들어 저장한다: 무료 2장, 시험용 골드 4골드 1장. */
async function makeThreeLooks(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();

  await wearOnly(page, FIRST);
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "골드를 쓰려면 가입해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await dev(page, "gold", { amount: 20 });
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await saveResult(page);

  await wearOnly(page, SECOND);
  await stageButton(page).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await saveResult(page);

  await wearOnly(page, THIRD);
  await stageButton(page).click();
  await makeSheet(page).getByRole("button", { name: "만들기", exact: true }).click();
  await page
    .getByRole("dialog", { name: "완성 룩 1장 만들기" })
    .getByRole("button", { name: "4골드 쓰기" })
    .click();
  await saveResult(page);
}

async function openShelf(page: Page) {
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "룩북" }).click();
}

const book = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title} 룩북 보기`) });
/** 룩북 크게 보기의 룩 제목. 뒤에 남은 홈 카드에도 같은 글자가 있어 화면 안에서 찾는다. */
const lookTitle = (page: Page, title: string) =>
  page.getByTestId("lookbook-book").getByText(title, { exact: true });
const putSheet = (page: Page) => page.getByRole("dialog", { name: "다른 룩북에 넣기" });
const newSheet = (page: Page) => page.getByRole("dialog", { name: "새 룩북 만들기" });

/** 「다른 룩북에 넣기」 → 「새 룩북 만들기」 로 룩북을 만든다. 만들면 넣기 시트로 돌아와 새 룩북이 골라져 있다. */
async function createFromPutSheet(page: Page, title: string) {
  await putSheet(page).getByRole("button", { name: "새 룩북 만들기" }).click();
  await expect(putSheet(page)).toHaveCount(0);
  await newSheet(page).getByRole("button", { name: "만들기" }).click();
  await expect(toast(page)).toContainText("룩북 이름을 적어 주세요");
  await newSheet(page).getByLabel("룩북 이름").fill(title);
  await newSheet(page).getByRole("button", { name: "만들기" }).click();
  await expect(toast(page)).toContainText(`「${title}」 룩북을 만들었어요`);
  await expect(
    putSheet(page).getByRole("radio", { name: new RegExp(`^${title},`) }),
  ).toHaveAttribute("aria-checked", "true");
}

test("D13~D15: 별과 「즐겨찾기만」, 새 룩북에 복사해서 넣기, 다른 룩북으로 옮기기와 되돌리기", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await makeThreeLooks(page);

  // 홈 「최근 저장한 룩」 에 완성 룩 셋이 최근 순으로 보이고, 누르면 그 룩이 든 「모든 룩」 크게 보기가 열린다.
  await page.getByRole("tab", { name: "홈" }).click();
  await expect(page.getByRole("button", { name: /룩 보기$/ })).toHaveCount(3);
  await page.getByRole("button", { name: `${SECOND} 룩 보기` }).click();
  await expect(page.getByRole("heading", { name: "모든 룩" })).toBeVisible();
  await expect(lookTitle(page, SECOND)).toBeVisible();
  await expect(page.getByText("2 / 3")).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();

  await openShelf(page);
  await expect(page.getByText("내 룩북 0권")).toBeVisible();
  await expect(page.getByText("누르면 룩을 크게 봐요")).toBeVisible();
  await book(page, "모든 룩").click();

  // D13: 별을 켜면 알림과 칩 수가 바뀌고, 「즐겨찾기만」 은 별을 켠 룩만 넘겨 본다.
  await expect(page.getByRole("button", { name: "전체 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "즐겨찾기만 0" })).toBeVisible();
  await expect(lookTitle(page, THIRD)).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(toast(page)).toContainText("즐겨찾기에 넣었어요");
  await expect(page.getByRole("button", { name: "즐겨찾기 풀기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "즐겨찾기만 1" })).toBeVisible();
  await page.getByRole("button", { name: "다음 룩" }).click();
  await page.getByRole("button", { name: "다음 룩" }).click();
  await expect(lookTitle(page, FIRST)).toBeVisible();
  await page.getByRole("button", { name: "다음 룩" }).click();
  await expect(page.getByText("마지막 쪽")).toBeVisible();
  await page.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(page.getByRole("button", { name: "즐겨찾기만 2" })).toBeVisible();

  await page.getByRole("button", { name: "즐겨찾기만 2" }).click();
  await expect(lookTitle(page, FIRST)).toBeVisible();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.getByRole("button", { name: "이전 룩" }).click();
  await expect(lookTitle(page, THIRD)).toBeVisible();
  await page.getByRole("button", { name: "이전 룩" }).click();
  await expect(page.getByText("첫 쪽")).toBeVisible();
  await page.getByRole("button", { name: "다음 룩" }).click();
  await expect(lookTitle(page, FIRST)).toBeVisible();
  // 즐겨찾기만 보는 중에 별을 풀면 그 룩이 바로 빠진다.
  await page.getByRole("button", { name: "즐겨찾기 풀기" }).click();
  await expect(toast(page)).toContainText("즐겨찾기에서 뺐어요");
  await expect(page.getByRole("button", { name: "즐겨찾기만 1" })).toBeVisible();
  await expect(page.getByText("1 / 1")).toBeVisible();
  await expect(lookTitle(page, THIRD)).toBeVisible();
  await page.getByRole("button", { name: "전체 3" }).click();
  await expect(page.getByText("1 / 3")).toBeVisible();

  // 「모든 룩」 에서 연 시트: 「옮기기」 는 늘 회색이고 복사만 된다. 둘째 룩을 새 룩북 「주말 데이트」 에 복사한다.
  await page.getByRole("button", { name: "다음 룩" }).click();
  await expect(lookTitle(page, SECOND)).toBeVisible();
  await page.getByRole("button", { name: "다른 룩북에 넣기" }).click();
  await expect(putSheet(page)).toContainText(SECOND);
  await expect(putSheet(page)).toContainText("「모든 룩」에서는 복사해서 넣기만 할 수 있어요");
  await createFromPutSheet(page, "주말 데이트");
  // 룩북을 골라도 「모든 룩」 에서는 「옮기기」 가 회색 바탕이다.
  await expect(putSheet(page).getByRole("button", { name: "옮기기" })).toHaveCSS(
    "background-color",
    "rgb(231, 230, 227)",
  );
  await putSheet(page).getByRole("button", { name: "옮기기" }).click();
  await expect(toast(page)).toContainText("「모든 룩」에서는 복사해서 넣기만 할 수 있어요");
  await putSheet(page).getByRole("button", { name: "복사해서 넣기" }).click();
  await expect(toast(page)).toContainText("「주말 데이트」에도 넣었어요");
  await expect(putSheet(page)).toHaveCount(0);

  // D14: 셋째 룩으로 「새 룩북 만들기」 「겨울 여행」 → 「복사해서 넣기」 → 그 룩이 두 룩북에 다 있다.
  await page.getByRole("button", { name: "이전 룩" }).click();
  await expect(lookTitle(page, THIRD)).toBeVisible();
  await page.getByRole("button", { name: "다른 룩북에 넣기" }).click();
  await expect(putSheet(page).getByRole("radio", { name: "주말 데이트, 룩 1개" })).toBeVisible();
  await createFromPutSheet(page, "겨울 여행");
  await putSheet(page).getByRole("button", { name: "복사해서 넣기" }).click();
  await expect(toast(page)).toContainText("「겨울 여행」에도 넣었어요");
  await page.getByRole("button", { name: "다른 룩북에 넣기" }).click();
  const already = putSheet(page).getByRole("radio", { name: "겨울 여행, 이미 있어요" });
  await already.click();
  await expect(toast(page)).toContainText("이미 「겨울 여행」 룩북에 있어요");
  await expect(already).toHaveAttribute("aria-checked", "false");
  await putSheet(page).getByRole("button", { name: "닫기" }).click();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();

  await expect(page.getByText("내 룩북 2권")).toBeVisible();
  await expect(book(page, "모든 룩")).toContainText("룩 3개");
  await expect(book(page, "모든 룩")).toContainText("기본 룩북");
  await expect(book(page, "겨울 여행")).toContainText("룩 1개");
  await book(page, "겨울 여행").click();
  await expect(page.getByRole("heading", { name: "겨울 여행" })).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 1" })).toBeVisible();
  await expect(lookTitle(page, THIRD)).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();

  // D15: 「주말 데이트」 안에서 고르기 전 두 단추는 회색이고 알림만 뜬다. 「겨울 여행」 으로 옮기고 되돌린다.
  await book(page, "주말 데이트").click();
  await expect(page.getByRole("heading", { name: "주말 데이트" })).toBeVisible();
  await expect(lookTitle(page, SECOND)).toBeVisible();
  await page.getByRole("button", { name: "다른 룩북에 넣기" }).click();
  const sheet = putSheet(page);
  await expect(sheet).toContainText(
    "복사해서 넣으면 두 룩북에 다 있고, 옮기면 「주말 데이트」에서 빠져요",
  );
  await expect(sheet.getByRole("radio", { name: /^주말 데이트/ })).toHaveCount(0);
  const copyButton = sheet.getByRole("button", { name: "복사해서 넣기" });
  const moveButton = sheet.getByRole("button", { name: "옮기기" });
  await expect(copyButton.getByText("복사해서 넣기")).toHaveCSS("color", "rgb(118, 115, 108)");
  await expect(moveButton).toHaveCSS("background-color", "rgb(231, 230, 227)");
  await copyButton.click();
  await expect(toast(page)).toContainText("넣을 룩북을 먼저 골라 주세요");
  await moveButton.click();
  await expect(toast(page)).toContainText("옮길 룩북을 먼저 골라 주세요");

  await sheet.getByRole("radio", { name: "겨울 여행, 룩 1개" }).click();
  await expect(moveButton).toHaveCSS("background-color", "rgb(21, 19, 20)");
  await moveButton.click();
  await expect(sheet).toHaveCount(0);
  await expect(toast(page)).toContainText("「겨울 여행」 룩북으로 옮겼어요");
  await expect(page.getByRole("button", { name: "전체 0" })).toBeVisible();
  await expect(page.getByText("아직 룩이 없어요")).toBeVisible();
  await toast(page).getByRole("button", { name: "되돌리기" }).click();
  await expect(toast(page)).toContainText("「주말 데이트」로 되돌렸어요");
  await expect(page.getByRole("button", { name: "전체 1" })).toBeVisible();
  await expect(lookTitle(page, SECOND)).toBeVisible();

  // 되돌리지 않고 다시 옮기면 「겨울 여행」 에 두 룩이 있고 「주말 데이트」 는 빈다.
  await page.getByRole("button", { name: "다른 룩북에 넣기" }).click();
  await sheet.getByRole("radio", { name: "겨울 여행, 룩 1개" }).click();
  await moveButton.click();
  await expect(toast(page)).toContainText("「겨울 여행」 룩북으로 옮겼어요");
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(book(page, "겨울 여행")).toContainText("룩 2개");
  await expect(book(page, "주말 데이트")).toContainText("룩 0개");
  await expect(book(page, "주말 데이트")).toContainText("아직 룩이 없어요");
  await expect(book(page, "모든 룩")).toContainText("룩 3개");
});

test("책장의 「새 룩북」 카드로 빈 룩북을 만들면 「아직 룩이 없어요」 표지가 생기고 권 수가 오른다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await wearOnly(page, FIRST);
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "골드를 쓰려면 가입해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await saveResult(page);

  await openShelf(page);
  await expect(page.getByText("내 룩북 0권")).toBeVisible();
  await page.getByRole("button", { name: "새 룩북" }).click();
  await expect(newSheet(page)).toContainText("12자까지 적을 수 있어요");
  const name = newSheet(page).getByLabel("룩북 이름");
  await expect(name).toHaveAttribute("placeholder", "예: 출근룩, 데이트");
  await name.fill("아주아주긴룩북이름열세글자");
  await expect(name).toHaveValue("아주아주긴룩북이름열세글");
  await name.fill("겨울 여행");
  await newSheet(page).getByRole("button", { name: "만들기" }).click();
  await expect(toast(page)).toContainText("「겨울 여행」 룩북을 만들었어요");
  await expect(page.getByText("내 룩북 1권")).toBeVisible();
  await expect(book(page, "겨울 여행")).toContainText("아직 룩이 없어요");
  await expect(book(page, "겨울 여행")).toContainText("룩 0개");
});

test("룩북 크게 보기에서 사진 서명 주소가 열리지 않으면 룩북을 한 번 다시 읽어 새 주소로 사진을 보인다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await wearOnly(page, FIRST);
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "골드를 쓰려면 가입해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await saveResult(page);

  // 첫 사진 요청만 기한 지난 주소처럼 403 으로 막는다. 서명 기한은 초 단위라 1초 넘게 끌어 새 주소가 달라지게 한다.
  const requests: { url: URL; blocked: boolean }[] = [];
  await page.route(/\/v1\/files\//, async (route) => {
    const blocked = requests.length === 0;
    requests.push({ url: new URL(route.request().url()), blocked });
    if (!blocked) {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await route.fulfill({ status: 403, body: "" });
  });
  const loaded: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/v1/files/") && response.status() === 200)
      loaded.push(url.pathname);
  });
  await page.goto("/lookbook/all");
  await expect(page.getByRole("heading", { name: "모든 룩" })).toBeVisible();
  await expect(lookTitle(page, FIRST)).toBeVisible();

  await expect.poll(() => requests.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  const [first, again] = requests;
  expect(again?.url.pathname).toBe(first?.url.pathname);
  expect(again?.url.search).not.toBe(first?.url.search);
  await expect.poll(() => loaded).toContain(first?.url.pathname);
});

import { expect, test, type Locator, type Page } from "@playwright/test";

// 「완성 룩 만들기」 시트, 무대 단추 상태, 만드는 중, 결과, 실패, 「내 골드」.
// 기대값은 와이어프레임 v27 의 완성 룩 화면과 시안 v2 명세 5(완성 룩 만들기 시트와 결과), 명세 2(「이대로 입히기」 상태)에서 가져온다.
// 시험마다 새 브라우저라 시험 로그인 subject 가 새로 생기고, 서버에는 새 사용자다.
test.use({ viewport: { width: 390, height: 844 } });

const API_URL = `http://localhost:${process.env.NUNO_E2E_API_PORT ?? 8877}`;
const COAT = "그레이 더블 울 하프코트";
/** 시트와 만드는 중 화면에서 빠져야 하는 글: 장 종류 표기와 실패를 미리 알리는 문장 */
const GONE = ["앞 1장", "앞모습", "2장 중 1장", "돌려드려요", "만들지 못하면"];

const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem("nuno.session-token") ?? "");

/** 그 브라우저의 시험 계정에 개발 전용 주소를 부른다(가짜 공급사 모드, 시험용 골드). */
async function dev(page: Page, path: string, body: object) {
  const response = await page.request.post(`${API_URL}/v1/dev/${path}`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
    data: body,
  });
  expect(response.ok()).toBe(true);
}

const stageButton = (page: Page) => page.getByRole("button", { name: "이대로 입히기" });
const makeSheet = (page: Page) => page.getByRole("dialog", { name: "완성 룩 만들기" });

async function expectNone(scope: Locator, texts: readonly string[]) {
  for (const text of texts) await expect(scope.getByText(text, { exact: false })).toHaveCount(0);
}

/** 코디 무대를 열고 옷을 비운 뒤 코트 한 벌만 입힌다. */
async function wearCoat(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await page.getByRole("button", { name: "옷 비우기" }).click();
  // 알림이 들어오는 순간 옷을 누르면 클릭이 「되돌리기」 에 맞을 수 있어, 알림이 뜬 뒤에 누른다.
  await expect(page.getByRole("alert")).toContainText("옷을 모두 비웠어요");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
  await page
    .getByRole("list", { name: "옷 목록" })
    .getByRole("button", { name: COAT, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
}

/** 가입 전에는 가입 시트가 먼저 열린다. 시험 계정으로 들어가면 동의 화면이 뜬다. */
async function signUpFromStage(page: Page) {
  await stageButton(page).click();
  const join = page.getByRole("dialog", { name: "완성 룩을 만들려면 가입이 필요해요" });
  await expect(join).toContainText("가입은 무료예요. 닫아도 지금 코디는 이 휴대폰에 그대로 남아요");
  await join.getByRole("button", { name: "시험 계정으로 계속하기" }).click();
  await expect(
    page.getByRole("heading", { name: "완성 룩을 만들기 전에 확인해 주세요" }),
  ).toBeVisible();
}

async function agree(page: Page) {
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await expect(makeSheet(page)).toBeVisible();
}

/** 무료 장으로 한 장 만들고 결과를 저장한 뒤 무대로 돌아온다. */
async function makeFreeAndSave(page: Page) {
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();
}

test("가입 시트, 무료 상태 시트, 만드는 중, 무대 단추 상태를 거쳐 결과를 저장하면 「모든 룩에 저장했어요」 가 뜬다", async ({
  page,
}) => {
  await wearCoat(page);

  // 무대 「이대로 입히기」: 높이 44, 옆 글 「무료 2장 남음」
  const button = stageButton(page);
  await expect(button).toContainText("무료 2장 남음");
  const rect = await button.boundingBox();
  expect(Math.round(rect?.height ?? 0)).toBe(44);
  expect(Math.round(rect?.width ?? 0)).toBeGreaterThanOrEqual(185);

  await signUpFromStage(page);
  await dev(page, "provider", { mode: "succeed", delayMs: 4000 });
  await agree(page);

  // 무료 상태 시트: 「가격」, 줄 그은 「4골드」, 체리색 「무료」, 남은 사진 수 줄
  const sheet = makeSheet(page);
  await expect(sheet.getByText("가격", { exact: true })).toBeVisible();
  const listPrice = sheet.getByText("4골드", { exact: true });
  await expect(listPrice).toHaveCSS("text-decoration-line", "line-through");
  await expect(sheet.getByText("무료", { exact: true })).toHaveCSS("color", "rgb(184, 35, 63)");
  await expect(sheet.getByText("무료로 만들 수 있는 사진이 2장 남았어요")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "무료로 만들기" })).toHaveCSS(
    "background-color",
    "rgb(184, 35, 63)",
  );
  await expectNone(sheet, GONE);

  // 만드는 중 화면 글
  await sheet.getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  await expect(page.getByText("완성 룩을 만들고 있어요")).toBeVisible();
  await expect(
    page.getByText("화면을 닫아도 계속 만들어요. 다 되면 알림을 보내 드려요"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "닫기" })).toBeVisible();
  await expectNone(page.locator("body"), GONE);

  // 「코디로 돌아가기」 → 무대 단추가 「완성 룩 만드는 중」, 다 되면 알림과 「다 된 완성 룩 보기」
  await page.getByRole("button", { name: "코디로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/fitting\/coordi/);
  await expect(page.getByRole("button", { name: "완성 룩 만드는 중" })).toBeVisible();
  await expect(stageButton(page)).toHaveCount(0);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("완성 룩이 나왔어요", { timeout: 20_000 });
  await expect(alert.getByRole("button", { name: "보기" })).toBeVisible();
  const done = page.getByRole("button", { name: "다 된 완성 룩 보기" });
  await expect(done).toBeVisible();
  await expect(done).toHaveCSS("background-color", "rgb(21, 19, 20)");

  // 결과 화면 「안전 확인 완료」, 「입은 옷 1벌」 과 옷의 칸, 저장 알림 「모든 룩에 저장했어요」 와 「룩북에서 보기」
  await done.click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible();
  await expect(page.getByText("안전 확인 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("주름과 핏은 실제와 다를 수 있어요")).toHaveCount(0);
  const worn = page.getByLabel("입은 옷", { exact: true });
  await expect(worn.getByRole("heading", { name: "입은 옷 1벌" })).toBeVisible();
  await expect(worn.getByText(COAT)).toBeVisible();
  // 옷장에 넣지 않은 기본 제공 옷이라 칸 이름이 「기본 제공 옷」 이다.
  await expect(worn.getByText("기본 제공 옷", { exact: true })).toBeVisible();
  await expect(page.getByText("저장한 그림에는 「AI 생성」 표시가", { exact: false })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(alert).toContainText("모든 룩에 저장했어요");
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await alert.getByRole("button", { name: "룩북에서 보기" }).click();
  await expect(page).toHaveURL(/\/lookbook\/all/);
});

test("무료 장 작업을 가짜 공급사가 안전 기준으로 거절하면 무료 1장을 돌려준 실패 화면과 「코디 바꾸기」 가 뜬다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await dev(page, "provider", { mode: "refuse" });
  await agree(page);
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();

  await expect(page.getByText("무료 1장을 돌려드렸어요", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  const title = page.getByRole("heading", { level: 2 });
  await expect(title).toContainText("만들지 못했어요.");
  await expect(title).toContainText("무료 1장을 돌려드렸어요");
  await expect(page.getByText("안전 기준을 통과하지 못했어요", { exact: true })).toBeVisible();
  await expect(page.getByText("돌려받은 무료 사진", { exact: true })).toBeVisible();
  await expect(page.getByText("+1장", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "같은 코디로 다시 만들기" })).toHaveCount(0);

  await page.getByRole("button", { name: "코디 바꾸기" }).click();
  await expect(page).toHaveURL(/\/fitting\/coordi/);
  await expect(stageButton(page)).toContainText("무료 2장 남음");
});

test("무료 장을 다 쓰면 「1장 4골드」 와 골드 상태 시트, 골드 작업 실패는 4골드를 돌려주고 「내 골드」 에 반환 안내가 없다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await dev(page, "gold", { amount: 20 });
  await agree(page);
  await makeFreeAndSave(page);
  await stageButton(page).click();
  await expect(makeSheet(page)).toContainText("무료로 만들 수 있는 사진이 1장 남았어요");
  await makeFreeAndSave(page);

  // 무대 옆 글과 골드 상태 시트
  await expect(stageButton(page)).toContainText("1장 4골드");
  await dev(page, "provider", { mode: "refuse" });
  await stageButton(page).click();
  const sheet = makeSheet(page);
  await expect(sheet.getByText("가격", { exact: true })).toBeVisible();
  await expect(sheet.getByText("4골드", { exact: true })).toBeVisible();
  await expect(sheet.getByText("400원", { exact: true })).toBeVisible();
  await expect(sheet.getByText("내 골드", { exact: true })).toBeVisible();
  await expect(sheet.getByText("20골드", { exact: true })).toBeVisible();
  await expect(sheet.getByText("무료", { exact: true })).toHaveCount(0);
  await expectNone(sheet, GONE);
  await expect(page.getByRole("dialog", { name: "완성 룩 1장 만들기" })).toHaveCount(0);

  await sheet.getByRole("button", { name: "4골드 사용" }).click();
  const title = page.getByRole("heading", { level: 2 });
  await expect(title).toContainText("골드를 돌려드렸어요", { timeout: 20_000 });
  await expect(title).toContainText("만들지 못했어요.");
  await expect(page.getByText("돌려받은 골드", { exact: true })).toBeVisible();
  await expect(page.getByText("+4골드", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "코디 바꾸기" }).click();

  // 「내 골드」 아래 글
  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "내 골드 20골드" }).click();
  const wallet = page.getByTestId("gold-screen");
  await expect(wallet.getByText("1골드는 100원이에요", { exact: true })).toBeVisible();
  await expectNone(wallet, ["돌려드려요"]);
});

test("옷장에 추가한 내 옷을 입혀 만든 완성 룩은 「입은 옷」 목록에서 그 옷 옆에 「내 옷장」 이 보인다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const knit = "스트라이프 니트";
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
  await page.getByRole("button", { name: "옷 추가", exact: true }).first().click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog", { name: "옷을 어떻게 추가할까요?" })
    .getByRole("button", { name: "앨범에서 고르기" })
    .click();
  await (await chooser).setFiles("e2e/fixtures/garments/knit-stripe.jpg");
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "이름" }).fill(knit);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "내 옷에 추가", exact: true }).click();
  await page.getByRole("button", { name: "이 옷으로 코디하기" }).click();
  await expect(page.getByRole("button", { name: `무대의 ${knit}` })).toBeVisible();

  await signUpFromStage(page);
  await dev(page, "provider", { mode: "succeed" });
  await agree(page);
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  const worn = page.getByLabel("입은 옷", { exact: true });
  await expect(worn.getByText(knit, { exact: true })).toBeVisible();
  await expect(worn.getByText("내 옷장", { exact: true })).toHaveCount(1);
});

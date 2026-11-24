import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

// 「이대로 입히기」 흐름. 기대값은 로드맵 T7 DoD(plan_T7 D1~D11)와 plan 「화면 문구」 에서 가져온다.
// 시험마다 새 브라우저라 시험 로그인 subject 가 새로 생기고, 서버에는 새 사용자다.
// API 와 worker 는 playwright.config.ts 가 scripts/e2e-api.mjs 로 nuno_e2e DB 에 띄운다.

const API_URL = `http://localhost:${process.env.NUNO_E2E_API_PORT ?? 8877}`;
const COAT = "그레이 더블 울 하프코트";

/** 시험 DB 를 관리자로 읽는다. 값 하나를 글자로 돌려준다. */
function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "nuno_e2e",
      "-t",
      "-A",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}

const subjectOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem("nuno.dev-subject") ?? "");
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

/** 코디 무대를 열고 옷을 모두 벗긴 뒤 코트 한 벌만 입힌다. */
async function wearCoat(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await page.getByRole("button", { name: "입은 옷 모두 벗기" }).click();
  // 벗기기가 끝나면 「되돌리기」 알림이 뜬다. 알림이 들어오는 순간 누르면 클릭이 「되돌리기」 에 맞아
  // 원래 코디로 돌아간다. 알림이 뜬 뒤에 누르면 Playwright 가 알림이 옷 목록을 가리는 동안 기다린다.
  await expect(page.getByRole("alert")).toContainText("입은 옷을 모두 벗었어요");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
  await page
    .getByRole("list", { name: "옷 목록" })
    .getByRole("button", { name: COAT, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
}

/** 가입 시트에서 시험 계정으로 들어간다. 가입하면 처음 누른 흐름이 이어져 동의 화면이 뜬다. */
async function signUpFromStage(page: Page) {
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "골드를 쓰려면 가입해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await expect(
    page.getByRole("heading", { name: "완성 룩을 만들기 전에 확인해 주세요" }),
  ).toBeVisible();
}

async function agree(page: Page) {
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await expect(page.getByRole("dialog", { name: "완성 룩 만들기" })).toBeVisible();
}

const makeSheet = (page: Page) => page.getByRole("dialog", { name: "완성 룩 만들기" });

/** 무료 장으로 한 장 만들고 결과를 저장한 뒤 무대로 돌아온다. */
async function makeFreeAndSave(page: Page) {
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();
}

test("D1, D2: 가입 전 「이대로 입히기」 는 가입 시트를 먼저 열고, 닫아도 코디가 남으며, 다시 들어와도 사용자는 하나다", async ({
  page,
}) => {
  await wearCoat(page);
  await expect(page.getByText("무료 2장 남음")).toBeVisible();
  await stageButton(page).click();
  const join = page.getByRole("dialog", { name: "골드를 쓰려면 가입해요" });
  await expect(join).toContainText("닫아도 지금 코디는 이 휴대폰에 그대로 남아요.");
  await join.getByRole("button", { name: "닫기" }).click();
  await expect(join).toHaveCount(0);
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();

  await signUpFromStage(page);
  const subject = await subjectOf(page);
  const usersOf = () =>
    sql(`SELECT count(*) FROM auth_identities WHERE provider = 'dev' AND subject = '${subject}'`);
  expect(usersOf()).toBe("1");
  const allUsers = sql("SELECT count(*) FROM users");

  await page.getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page
    .getByRole("dialog", { name: "로그아웃할까요?" })
    .getByRole("button", { name: "로그아웃" })
    .click();
  await expect(page.getByRole("alert")).toContainText("로그아웃했어요");
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  expect(await tokenOf(page)).toBe("");

  await page.getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
  await signUpFromStage(page);
  expect(usersOf()).toBe("1");
  expect(sql("SELECT count(*) FROM users")).toBe(allUsers);
});

test("D3~D8: 동의 화면을 먼저 거쳐 무료 장으로 만들고, 만드는 중과 결과를 보고, 저장 전 뒤로는 나가기 시트를 연다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await expect(makeSheet(page)).toHaveCount(0);
  await expect(page.getByText("받는 곳은 fake(대한민국)예요")).toBeVisible();
  await dev(page, "provider", { mode: "succeed", delayMs: 4000 });
  await agree(page);

  const subject = await subjectOf(page);
  expect(
    sql(`SELECT count(*) FROM consents c JOIN auth_identities i ON i.user_id = c.user_id
         WHERE i.provider = 'dev' AND i.subject = '${subject}'
           AND c.text_version IS NOT NULL AND c.agreed_at IS NOT NULL`),
  ).toBe("1");

  await expect(makeSheet(page)).toContainText("이번에는 첫 체험 무료 2장 중 1장을 써요");
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  await expect(page.getByText("앞모습을 그리고 있어요")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/화면을 닫아도 계속 만들어요/)).toBeVisible();

  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: "완성 룩 사진" }).first()).toBeVisible();

  const leave = page.getByRole("dialog", { name: "저장하지 않고 나갈까요?" });
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(leave).toContainText("나가면 이 사진은 사라져요");
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await expect(leave).toHaveCount(0);
  await page.goBack();
  await expect(leave).toBeVisible();
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible();

  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("룩북에 저장했어요. 나만 볼 수 있어요");
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(leave).toHaveCount(0);
  await expect(page.getByText("무료 1장 남음")).toBeVisible();
});

test("D9: 「나가기」 전에 적어 둔 결과 서명 주소는 나간 뒤 열리지 않는다. 만드는 중에 닫아도 끝나면 알림이 뜬다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await dev(page, "provider", { mode: "succeed", delayMs: 3000 });
  await agree(page);
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("alert")).toContainText("다 만들면 알려 드릴게요");
  await expect(page.getByRole("alert")).toContainText("완성 룩이 다 됐어요", { timeout: 20_000 });
  await page.getByRole("alert").getByRole("button", { name: "보기" }).click();

  const photo = page.getByRole("img", { name: "완성 룩 사진" }).first().locator("img");
  await expect(photo).toHaveAttribute("src", /\/v1\/files\//);
  const url = (await photo.getAttribute("src")) ?? "";
  expect((await page.request.get(url)).status()).toBe(200);

  await page.getByRole("button", { name: "뒤로" }).click();
  await page
    .getByRole("dialog", { name: "저장하지 않고 나갈까요?" })
    .getByRole("button", { name: "나가기" })
    .click();
  await expect(stageButton(page)).toBeVisible();
  expect([403, 404]).toContain((await page.request.get(url)).status());
});

test("D10: 무료 장 작업을 가짜 공급사가 거절하면 「만들지 못했어요」 가 뜨고 무료 장이 돌아오며 골드는 그대로다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await dev(page, "provider", { mode: "refuse" });
  await agree(page);
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();

  await expect(page.getByText("만들지 못했어요.", { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("무료 1장을 돌려드렸어요")).toBeVisible();
  await expect(page.getByText("+1장")).toBeVisible();
  await expect(page.getByText("2장", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "다른 옷으로 다시 해 보기" }).click();
  await expect(page.getByText("무료 2장 남음")).toBeVisible();
  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "내 골드 0골드" }).click();
  const wallet = page.getByTestId("gold-screen");
  await expect(wallet.getByRole("heading", { name: "내 골드" })).toBeVisible();
  await expect(wallet.getByText("0골드", { exact: true })).toBeVisible();
});

test("D11: 무료 장을 다 쓴 뒤 골드로 만든 작업이 거절되면 4골드가 돌아오고 「내 골드」 에 「완성 룩 환불」 줄이 있다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  await dev(page, "gold", { amount: 20 });
  await agree(page);
  await makeFreeAndSave(page);
  await stageButton(page).click();
  await makeFreeAndSave(page);
  await expect(page.getByText("4골드", { exact: true })).toBeVisible();

  await dev(page, "provider", { mode: "refuse" });
  await stageButton(page).click();
  await expect(makeSheet(page)).toContainText("이번에는 내 골드에서 4골드를 써요");
  await makeSheet(page).getByRole("button", { name: "만들기", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "완성 룩 1장 만들기" });
  await expect(confirm).toContainText("20 → 16골드");
  await confirm.getByRole("button", { name: "4골드 쓰기" }).click();

  await expect(page.getByText("골드를 돌려드렸어요")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("+4 골드")).toBeVisible();
  await expect(page.getByText("20 골드")).toBeVisible();

  await page.getByRole("button", { name: "다른 옷으로 다시 해 보기" }).click();
  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "내 골드 20골드" }).click();
  const wallet = page.getByTestId("gold-screen");
  await expect(wallet.getByText("20골드", { exact: true })).toBeVisible();
  const ledger = wallet.getByLabel("사용 내역");
  await expect(ledger.getByText("완성 룩 환불")).toBeVisible();
  await expect(ledger.getByText("+4골드")).toBeVisible();
});

test("무료 하루 한도에 닿으면 무료 장이 남아도 무대 단추가 4골드이고, 「4골드 쓰기」 로 골드 작업이 접수된다", async ({
  page,
}) => {
  await wearCoat(page);
  await signUpFromStage(page);
  const subject = await subjectOf(page);
  const userId = sql(
    `SELECT user_id FROM auth_identities WHERE provider = 'dev' AND subject = '${subject}'`,
  );
  // 오늘 무료 접수 네 건이 실패로 끝났다. 무료 장은 돌려받아 2장 그대로다.
  sql(`INSERT INTO generation_jobs
         (user_id, idempotency_key, request_hash, input_manifest, payment_kind, status,
          failure_code, created_at, finished_at)
       SELECT '${userId}', 'e2e-limit-' || g, 'hash', '{}', 'trial', 'failed',
              'provider_refused', now(), now()
       FROM generate_series(1, 4) AS g`);
  await dev(page, "gold", { amount: 20 });
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();

  await expect(makeSheet(page)).toContainText("이번에는 내 골드에서 4골드를 써요");
  await expect(stageButton(page)).toContainText("4골드");
  await expect(stageButton(page)).not.toContainText("무료");
  await makeSheet(page).getByRole("button", { name: "만들기", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "완성 룩 1장 만들기" });
  await expect(confirm).toContainText("오늘은 무료로 더 만들 수 없어요. 골드로 만들어요");
  await expect(confirm).toContainText("20 → 16골드");
  await confirm.getByRole("button", { name: "4골드 쓰기" }).click();

  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  expect(
    sql(`SELECT payment_kind FROM generation_jobs
         WHERE user_id = '${userId}' AND idempotency_key NOT LIKE 'e2e-limit-%'`),
  ).toBe("gold");
});

test("동의 화면이 받는 곳을 불러오지 못하면 체크 줄과 아래 단추를 막고, 「다시 불러오기」 로 받는 곳이 보이면 동의할 수 있다", async ({
  page,
}) => {
  await wearCoat(page);
  sql("UPDATE provider_configs SET enabled = false WHERE provider = 'fake'");
  try {
    await signUpFromStage(page);
    await expect(page.getByText("받는 곳을 불러오지 못했어요")).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "모두 동의하기" })).toBeDisabled();
  } finally {
    sql("UPDATE provider_configs SET enabled = true WHERE provider = 'fake'");
  }
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.getByText("받는 곳은 fake(대한민국)예요")).toBeVisible();
  await expect(page.getByText("받는 곳을 불러오지 못했어요")).toHaveCount(0);
  await agree(page);
});

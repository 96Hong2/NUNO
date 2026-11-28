import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "./server-looks";

// 계정 바꾸기. 기대값은 로드맵 DoD 문장: 로그아웃한 뒤 다른 계정으로 로그인하면 앞 계정의 완성 룩과 알림이
// 보이지 않고, 옷장과 「내 코디」 는 그대로 보인다. 알림은 지금 있는 작업 감시 알림과 「다 된 완성 룩 보기」 로 본다.
// 무대는 작업 하나씩만 접수하므로, 로그아웃 때 돌던 작업의 끝남 알림은 계정을 한 번 더 바꿔 본다.

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
const doneChip = (page: Page) => page.getByRole("button", { name: "다 된 완성 룩 보기" });
const runningChip = (page: Page) => page.getByRole("button", { name: "완성 룩 만드는 중" });
const bookButton = (page: Page, name: string) =>
  page.getByTestId("lookbook-book").getByRole("button", { name, exact: true });

async function openFitting(page: Page, cell: "코디" | "옷장" | "룩북") {
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: cell }).click();
}

async function signOut(page: Page) {
  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page
    .getByRole("dialog", { name: "로그아웃할까요?" })
    .getByRole("button", { name: "로그아웃" })
    .click();
  await expect(toast(page)).toContainText("로그아웃했어요");
}

/** 로그아웃한 뒤 시험 로그인 subject 를 새 값으로 바꿔 다른 계정으로 들어간다. 동의 화면에서 멈춘다 */
async function joinAsNewSubject(page: Page): Promise<string> {
  const subject = `web-${crypto.randomUUID()}`;
  await page.evaluate((value) => localStorage.setItem("nuno.dev-subject", value), subject);
  await page.getByRole("button", { name: "뒤로" }).click();
  await openFitting(page, "코디");
  await joinWithTestAccount(page);
  expect(await tokenOf(page)).not.toBe("");
  return subject;
}

async function joinWithTestAccount(page: Page) {
  await stageButton(page).click();
  await page
    .getByRole("dialog", { name: "완성 룩을 만들려면 가입이 필요해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await expect(
    page.getByRole("heading", { name: "완성 룩을 만들기 전에 확인해 주세요" }),
  ).toBeVisible();
}

test("로그아웃한 뒤 다른 계정으로 로그인하면 앞 계정의 완성 룩과 알림이 보이지 않고, 옷장과 「내 코디」 는 그대로 보인다", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });

  // 앞 계정: 코트 한 벌로 완성 룩을 하나 저장한다.
  await page.goto("/");
  await openFitting(page, "코디");
  await expect(page.getByRole("button", { name: "옷 칸 크게 올리기" })).toBeVisible();
  await page.getByRole("button", { name: "옷 비우기" }).click();
  await expect(toast(page)).toContainText("옷을 모두 비웠어요");
  await expect(page.getByTestId("stage-piece")).toHaveCount(0);
  await page
    .getByRole("list", { name: "옷 목록" })
    .getByRole("button", { name: COAT, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `무대의 ${COAT}` })).toBeVisible();
  await joinWithTestAccount(page);
  const firstSubject = await page.evaluate(() => localStorage.getItem("nuno.dev-subject"));
  await dev(page, "provider", { mode: "succeed", delayMs: 3000 });
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByText("✦ AI 생성")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "내 룩북에 저장" }).click();
  await expect(page.getByRole("button", { name: "룩북에 저장했어요" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();

  // 「내 코디」 에 지금 코디를 담는다.
  await page.getByRole("button", { name: "내 코디" }).click();
  const mine = page.getByRole("dialog", { name: "내 코디" });
  await mine.getByRole("button", { name: "지금 코디 담기", exact: true }).click();
  await expect(toast(page)).toContainText("내 코디에 저장했어요 1/5");
  await mine.getByRole("button", { name: "닫기" }).last().click();
  await expect(mine).toHaveCount(0);

  // 끝난 결과 하나를 저장하지 않고 남긴다. 무대에 「다 된 완성 룩 보기」 가 뜬다.
  await stageButton(page).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(toast(page)).toContainText("완성 룩이 나왔어요", { timeout: 20_000 });
  await expect(doneChip(page)).toBeVisible();

  // 저장한 룩의 입은 옷 시트에서 코트를 옷장 「담은 옷」 에 담는다.
  await openFitting(page, "룩북");
  await page.getByRole("button", { name: /^모든 룩 룩북 보기/ }).click();
  await expect(page.getByRole("heading", { name: "모든 룩", exact: true })).toBeVisible();
  await bookButton(page, "입은 옷 1벌 보기").click();
  const worn = page.getByRole("dialog", { name: "입은 옷 1개" });
  await worn.getByRole("checkbox", { name: `${COAT} 고르기` }).click();
  await worn.getByRole("button", { name: "옷장에 담기 1" }).click();
  await expect(toast(page)).toContainText("1벌을 옷장에 담았어요");
  await worn.getByRole("button", { name: "닫기" }).last().click();
  await bookButton(page, "뒤로").click();

  // 홈 「최근 저장한 룩」 에 앞 계정의 코트 룩이 보인다. 홈이 이 룩을 들고 있는 채로 계정을 바꾼다.
  await page.getByRole("tab", { name: "홈" }).click();
  await page.getByRole("button", { name: "최근 저장한 룩" }).click();
  await expect(page.getByRole("button", { name: `${COAT} 룩 보기` })).toBeVisible();

  // 로그아웃하고 다른 계정으로 들어간다.
  await signOut(page);
  const secondSubject = await joinAsNewSubject(page);
  expect(secondSubject).not.toBe(firstSubject);
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();

  // 앞 계정의 완성 룩과 알림이 없다.
  await expect(doneChip(page)).toHaveCount(0);
  await page.getByRole("tab", { name: "홈" }).click();
  await page.getByRole("button", { name: "최근 저장한 룩" }).click();
  // 「코디하러 가기」 는 저장한 룩이 없는 칸에만 있다. 홈이 새 계정으로 다시 읽은 뒤에 보인다.
  await expect(page.getByRole("button", { name: "코디하러 가기" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${COAT} 룩 보기` })).toHaveCount(0);
  await expect(page.getByText(/^저장한 룩 \d+개$/)).toHaveCount(0);
  await openFitting(page, "룩북");
  // 룩이 하나도 없으면 책장 대신 빈 안내가 보인다. 앞 계정의 「모든 룩」 책이 없다.
  await expect(page.getByText("아직 저장한 룩이 없어요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^모든 룩 룩북 보기/ })).toHaveCount(0);

  // 옷장 「담은 옷」 의 코트와 「내 코디」 는 그대로다.
  await openFitting(page, "옷장");
  await page.getByRole("button", { name: /^담은 옷 \d+$/ }).click();
  await expect(page.getByRole("button", { name: /^담은 옷 1$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: COAT, exact: true }).first()).toBeVisible();
  await openFitting(page, "코디");
  await page.getByRole("button", { name: "내 코디" }).click();
  await expect(
    page.getByRole("dialog", { name: "내 코디" }).getByRole("button", { name: /코디 입히기$/ }),
  ).toHaveCount(1);
  await page
    .getByRole("dialog", { name: "내 코디" })
    .getByRole("button", { name: "닫기" })
    .last()
    .click();

  // 작업 감시 알림: 이 계정으로 완성 룩 작업 하나를 오래 걸리게 접수하고, 끝나기 전에 로그아웃한다.
  // 로그아웃은 그 세션만 끊는다. 작업 상태는 같은 subject 로 따로 연 세션으로 묻는다.
  const spare = await page.request.post(`${API_URL}/v1/dev/login`, {
    data: { subject: secondSubject },
  });
  expect(spare.ok()).toBe(true);
  const { token: spareToken } = (await spare.json()) as { token: string };
  await dev(page, "provider", { mode: "succeed", delayMs: 20_000 });
  await stageButton(page).click();
  await page.getByRole("button", { name: "모두 동의하기" }).click();
  await page.getByRole("button", { name: "동의하고 만들기" }).click();
  await makeSheet(page).getByRole("button", { name: "무료로 만들기" }).click();
  await expect(page.getByRole("progressbar", { name: "만드는 중" })).toBeVisible();
  const runningJob = /\/generate\/([^/?#]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  expect(runningJob).not.toBe("");
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(runningChip(page)).toBeVisible();
  const jobStatus = async () => {
    const response = await page.request.get(`${API_URL}/v1/generation-jobs/${runningJob}`, {
      headers: { Authorization: `Bearer ${spareToken}` },
    });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { status: string }).status;
  };

  await signOut(page);
  expect(["queued", "generating", "checking"]).toContain(await jobStatus());
  expect(await joinAsNewSubject(page)).not.toBe(secondSubject);
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(stageButton(page)).toBeVisible();
  await expect(runningChip(page)).toHaveCount(0);

  // 앞 계정 작업이 서버에서 끝날 때까지 기다린다. 작업 감시는 2초마다 묻는다.
  // 끝난 뒤 두 번 넘게 물을 시간을 더 두고, 끝남 알림과 「다 된 완성 룩 보기」 가 없는지 본다.
  await expect.poll(jobStatus, { timeout: 60_000, intervals: [1_000] }).toBe("succeeded");
  await page.waitForTimeout(5_000);
  await expect(stageButton(page)).toBeVisible();
  await expect(doneChip(page)).toHaveCount(0);
  await expect(toast(page).filter({ hasText: "완성 룩이 나왔어요" })).toHaveCount(0);
});

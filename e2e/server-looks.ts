import { expect, type Page } from "@playwright/test";

// 서버 완성 룩을 화면을 거치지 않고 API 로 만들어 저장한다. 판정은 각 시험이 화면에서 한다.
// 시험 계정 로그인, 동의, 시험용 골드, 접수, 가짜 공급사 결과, 「내 룩북에 저장」 을 앱과 같은 주소로 부른다.

export const API_URL = `http://localhost:${process.env.NUNO_E2E_API_PORT ?? 8877}`;

const SUBJECT_KEY = "nuno.dev-subject";
const TOKEN_KEY = "nuno.session-token";

/** 견본 옷 한 벌. 입은 옷이 한 벌이면 룩 제목이 옷 이름이다 */
export interface SampleWear {
  key: string;
  name: string;
  category: string;
}

async function api<T>(
  page: Page,
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: object,
): Promise<T> {
  const response = await page.request.fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  expect(response.ok(), `${method} ${path} ${response.status()}`).toBe(true);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * 앱 첫 화면을 열고 새 시험 계정으로 로그인한 상태로 만든다. 앱 「시험 계정으로 계속하기」 와 같은 subject 를
 * 기기 저장소에 적어 둔다. 동의와 시험용 골드도 넣는다. 돌려주는 값은 세션 토큰이다.
 */
export async function signInWithGold(page: Page, gold: number): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "홈" })).toBeVisible();
  const subject = `e2e-${crypto.randomUUID()}`;
  const login = await page.request.post(`${API_URL}/v1/dev/login`, { data: { subject } });
  expect(login.ok()).toBe(true);
  const { token } = (await login.json()) as { token: string };
  await page.evaluate(
    ([subjectKey, tokenKey, value, session]) => {
      localStorage.setItem(subjectKey, value);
      localStorage.setItem(tokenKey, session);
    },
    [SUBJECT_KEY, TOKEN_KEY, subject, token] as const,
  );
  const { currentVersion } = await api<{ currentVersion: number }>(
    page,
    token,
    "GET",
    "/v1/consents/generation-transfer",
  );
  await api(page, token, "POST", "/v1/consents", {
    kind: "generation_transfer",
    textVersion: currentVersion,
  });
  await api(page, token, "POST", "/v1/dev/gold", { amount: gold });
  return token;
}

/** 견본 옷 한 벌로 완성 룩을 접수하고 가짜 공급사 결과를 기다린다. 작업 ID 를 돌려준다 */
export async function makeResult(page: Page, token: string, wear: SampleWear): Promise<string> {
  const item = {
    id: `s:${wear.key}`,
    name: wear.name,
    category: wear.category,
    closet: null,
    imageHash: "",
  };
  const { currentVersion } = await api<{ currentVersion: number }>(
    page,
    token,
    "GET",
    "/v1/consents/generation-transfer",
  );
  const { jobId } = await api<{ jobId: string }>(page, token, "POST", "/v1/generation-jobs", {
    requestId: `e2e-${crypto.randomUUID()}`,
    manifest: { twin: { preset: "harin", version: 1 }, items: [item], promptVersion: 1 },
    consentVersion: currentVersion,
    payWith: "gold",
  });
  await expect
    .poll(
      async () =>
        (await api<{ status: string }>(page, token, "GET", `/v1/generation-jobs/${jobId}`)).status,
      { timeout: 20_000 },
    )
    .toBe("succeeded");
  return jobId;
}

/** 끝난 결과를 「모든 룩」 에 저장한다. 서버 룩 ID 를 돌려준다 */
export async function keepResult(
  page: Page,
  token: string,
  jobId: string,
  wear: SampleWear,
): Promise<string> {
  const { lookId } = await api<{ lookId: string }>(
    page,
    token,
    "POST",
    `/v1/generation-jobs/${jobId}/keep`,
    {
      wornItems: [{ id: `s:${wear.key}`, name: wear.name, category: wear.category, closet: null }],
    },
  );
  return lookId;
}

/** 완성 룩을 만들어 차례로 저장한다. 저장한 순서대로 서버 룩 ID 를 돌려준다 */
export async function saveLooks(
  page: Page,
  token: string,
  wears: readonly SampleWear[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const wear of wears) {
    ids.push(await keepResult(page, token, await makeResult(page, token, wear), wear));
  }
  return ids;
}

/** 서버 룩북을 만들고 룩을 복사해 넣는다 */
export async function lookbookWith(
  page: Page,
  token: string,
  title: string,
  lookIds: readonly string[],
): Promise<string> {
  const { id } = await api<{ id: string }>(page, token, "POST", "/v1/lookbooks", { title });
  for (const lookId of lookIds) {
    await api(page, token, "POST", `/v1/looks/${lookId}/copy`, { lookbookId: id });
  }
  return id;
}

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalResultStore } from "../adapters/local-result-store.ts";
import { openPostgres } from "../adapters/postgres.ts";
import { CONSENT_KIND, CONSENT_TEXT_VERSION } from "../account/consent.ts";
import { createApp } from "../app.ts";

// 실제 Postgres 에 붙는 시험. scripts/test-db.mjs 가 판을 적용한 뒤 두 주소를 넘긴다.
// API 는 nuno_api 로 붙고, 스위치 켜기와 행 세기는 관리자로 한다. 사용자와 요청 ID 는 매번 새로 만든다.
// 이 파일은 작업을 선점하지 않는다. 접수한 작업은 queued 로 남고, worker 시험은 더 이른 시각의 자기 작업만 돌린다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
// 같은 요청 10건을 연결 10개로 동시에 보낸다.
const api = openPostgres(apiUrl, 10);
const admin = openPostgres(adminUrl);

const NOW = new Date("2030-04-01T03:00:00Z");
let resultDir = "";
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-gold-"));
  const store = createLocalResultStore({
    dir: resultDir,
    secret: "db-test",
    publicUrl: "http://api.test",
  });
  app = createApp(api, { devRoutes: true, now: () => NOW, results: store });
  await setSwitch(true);
});

afterAll(async () => {
  await setSwitch(false);
  await api.close();
  await admin.close();
  await rm(resultDir, { recursive: true, force: true });
});

async function setSwitch(enabled: boolean) {
  await admin.query("UPDATE feature_switches SET enabled = $1 WHERE key = 'generate_look'", [
    enabled,
  ]);
}

const pgError = (error: unknown) => (error as { code?: string }).code;

interface SignedIn {
  token: string;
  userId: string;
}

const call = async (
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function devLogin(subject = `db-test-${randomUUID()}`): Promise<SignedIn> {
  const response = await call("/v1/dev/login", null, { method: "POST", body: { subject } });
  expect(response.status).toBe(200);
  return (await response.json()) as SignedIn;
}

async function agree(token: string) {
  const response = await call("/v1/consents", token, {
    method: "POST",
    body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
  });
  expect(response.status).toBe(201);
}

/** 가입하고 동의까지 마친 사용자. */
async function readyUser(): Promise<SignedIn> {
  const user = await devLogin();
  await agree(user.token);
  return user;
}

const manifest = (tag = "a") => ({ twin: { preset: "harin", version: 1 }, items: [tag] });
const newRequestId = () => `req-${randomUUID()}`;

const submit = (token: string, requestId = newRequestId(), body: object = manifest()) =>
  call("/v1/generation-jobs", token, {
    method: "POST",
    body: { requestId, manifest: body, consentVersion: CONSENT_TEXT_VERSION },
  });

async function gold(token: string) {
  const response = await call("/v1/gold", token);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    trialCount: number;
    balance: number;
    entries: { at: string; label: string; amount: number }[];
  };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const [row] = await admin.query<{ n: number }>(sql, params);
  return row?.n ?? -1;
}

async function balance(userId: string, kind: string): Promise<number> {
  const [row] = await admin.query<{ n: number }>(
    `SELECT coalesce(sum(e.amount), 0)::int AS n
     FROM gold_accounts a LEFT JOIN gold_entries e ON e.account_id = a.id
     WHERE a.user_id = $1 AND a.kind = $2`,
    [userId, kind],
  );
  return row?.n ?? -1;
}

/** 무료 2장을 접수만 해서 trial 잔액을 0 으로 만든다. */
async function useUpTrial(token: string) {
  for (let i = 0; i < 2; i += 1) {
    const response = await submit(token);
    expect(await response.json()).toMatchObject({ paymentKind: "trial" });
  }
}

/** 관리자가 유상 골드를 직접 넣는다. 충전(T8) 전이라 판 함수로는 넣을 길이 없다. */
async function adminPaidGold(userId: string, amount: number) {
  await admin.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `INSERT INTO gold_transactions (user_id, kind, idempotency_key, memo, created_at)
       VALUES ($1, 'free_grant', $2, '시험 유상 골드', $3) RETURNING id`,
      [userId, `db-test-paid:${randomUUID()}`, NOW],
    );
    await tx.query(
      `INSERT INTO gold_entries (transaction_id, account_id, amount, created_at)
       SELECT $1, a.id, CASE WHEN a.user_id IS NULL THEN -$3::int ELSE $3::int END, $4
       FROM gold_accounts a
       WHERE (a.user_id = $2 AND a.kind = 'paid_gold') OR (a.user_id IS NULL AND a.kind = 'promo_grant')`,
      [row?.id, userId, amount, NOW],
    );
  });
}

describe("가입 때 무료 2장과 시험용 골드", () => {
  it("가입하면 trial 에 8골드(무료 2장)가 한 번 들어가고, 다시 로그인해도 8 그대로다", async () => {
    const subject = `db-test-${randomUUID()}`;
    const first = await devLogin(subject);
    expect(await gold(first.token)).toEqual({ trialCount: 2, balance: 0, entries: [] });

    const again = await devLogin(subject);
    expect(again.userId).toBe(first.userId);
    expect(await gold(again.token)).toEqual({ trialCount: 2, balance: 0, entries: [] });
    expect(await balance(first.userId, "trial")).toBe(8);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM gold_transactions WHERE user_id = $1 AND kind = 'trial_grant'",
        [first.userId],
      ),
    ).toBe(1);
  });

  it("시험용 골드는 한 번만 들어가고 「내 골드」 에 「시험용 골드」 줄로 보인다", async () => {
    const { token } = await devLogin();
    const grant = (amount: number) =>
      call("/v1/dev/gold", token, { method: "POST", body: { amount } });
    expect(await (await grant(20)).json()).toEqual({ granted: true });
    expect(await (await grant(50)).json()).toEqual({ granted: false });
    expect(await gold(token)).toEqual({
      trialCount: 2,
      balance: 20,
      entries: [{ at: NOW.toISOString(), label: "시험용 골드", amount: 20 }],
    });
  });
});

describe("접수와 묶기", () => {
  it("같은 요청 ID 10건을 동시에 보내면 작업 1건과 묶기 1건이고, 10건 모두 같은 작업 ID 를 받는다", async () => {
    const { token, userId } = await readyUser();
    const requestId = newRequestId();
    const responses = await Promise.all(Array.from({ length: 10 }, () => submit(token, requestId)));
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as {
      jobId: string;
    }[];
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(202));
    expect(new Set(bodies.map((body) => body.jobId)).size).toBe(1);

    expect(
      await count("SELECT count(*)::int AS n FROM generation_jobs WHERE user_id = $1", [userId]),
    ).toBe(1);
    expect(
      await count("SELECT count(*)::int AS n FROM gold_holds WHERE user_id = $1", [userId]),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM gold_transactions WHERE user_id = $1 AND kind = 'hold'",
        [userId],
      ),
    ).toBe(1);
    expect(await balance(userId, "trial")).toBe(4);
    expect(await balance(userId, "hold")).toBe(4);
  });

  it("잔액이 4골드인 계정에서 서로 다른 요청 둘을 동시에 보내면 하나만 접수되고 잔액은 0 이다", async () => {
    const { token } = await readyUser();
    await useUpTrial(token);
    await call("/v1/dev/gold", token, { method: "POST", body: { amount: 4 } });

    const responses = await Promise.all([submit(token), submit(token)]);
    expect(responses.map((response) => response.status).sort()).toEqual([202, 402]);
    expect((await gold(token)).balance).toBe(0);
  });

  it("무료 장이 없으면 무상 2와 유상 2를 섞어 4골드를 묶는다", async () => {
    const { token, userId } = await readyUser();
    await useUpTrial(token);
    await call("/v1/dev/gold", token, { method: "POST", body: { amount: 2 } });
    await adminPaidGold(userId, 2);

    const response = await submit(token);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ paymentKind: "gold" });
    expect(await balance(userId, "free_gold")).toBe(0);
    expect(await balance(userId, "paid_gold")).toBe(0);
    expect(await balance(userId, "hold")).toBe(12);
  });

  it("유상 잔액이 음수면 무상 골드가 있어도 402 insufficient_gold 다", async () => {
    const { token, userId } = await readyUser();
    await useUpTrial(token);
    await call("/v1/dev/gold", token, { method: "POST", body: { amount: 20 } });
    await adminPaidGold(userId, -2);

    const response = await submit(token);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "insufficient_gold" });
  });
});

describe("접수 거절", () => {
  it("동의가 없거나 철회했으면 403 consent_required 이고 작업과 묶음이 생기지 않는다", async () => {
    const { token, userId } = await devLogin();
    const none = await submit(token);
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: "consent_required" });

    await agree(token);
    await call("/v1/consents/withdraw", token, { method: "POST", body: { kind: CONSENT_KIND } });
    const withdrawn = await submit(token);
    expect(withdrawn.status).toBe(403);
    expect(await withdrawn.json()).toEqual({ error: "consent_required" });

    expect(
      await count("SELECT count(*)::int AS n FROM generation_jobs WHERE user_id = $1", [userId]),
    ).toBe(0);
    expect(await balance(userId, "trial")).toBe(8);
  });

  it("동의한 판이 접수 함수가 받은 판과 다르면 consent_required, 앱 판이 서버 판과 다르면 409 다", async () => {
    const { token, userId } = await readyUser();
    const [row] = await api.query<{ error_code: string | null }>(
      "SELECT error_code FROM nuno_submit_job($1, $2, $3, $4, $5, $6)",
      [userId, newRequestId(), "hash", "{}", CONSENT_TEXT_VERSION + 1, NOW],
    );
    expect(row?.error_code).toBe("consent_required");

    const outdated = await call("/v1/generation-jobs", token, {
      method: "POST",
      body: {
        requestId: newRequestId(),
        manifest: manifest(),
        consentVersion: CONSENT_TEXT_VERSION + 1,
      },
    });
    expect(outdated.status).toBe(409);
    expect(await outdated.json()).toEqual({ error: "consent_text_outdated" });
  });

  it("「이대로 입히기」 스위치가 꺼져 있으면 503 switch_off 다", async () => {
    const { token } = await readyUser();
    await setSwitch(false);
    try {
      const response = await submit(token);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "switch_off" });
    } finally {
      await setSwitch(true);
    }
  });

  it("같은 요청 ID 에 다른 입력이 오면 409 request_mismatch 이고, 같은 입력이면 처음 작업을 준다", async () => {
    const { token } = await readyUser();
    const requestId = newRequestId();
    const first = (await (await submit(token, requestId, { b: 1, a: [1, 2] })).json()) as {
      jobId: string;
    };
    // 키 순서만 다르면 같은 입력이다.
    const same = await submit(token, requestId, { a: [1, 2], b: 1 });
    expect(same.status).toBe(202);
    expect(await same.json()).toMatchObject({ jobId: first.jobId, status: "queued" });

    const other = await submit(token, requestId, { a: [2, 1], b: 1 });
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: "request_mismatch" });
  });

  it("무료 장도 골드도 없으면 402 insufficient_gold 다", async () => {
    const { token } = await readyUser();
    await useUpTrial(token);
    const response = await submit(token);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "insufficient_gold" });
  });
});

describe("원장과 작업 표 권한", () => {
  it("nuno_api 로 gold_entries, gold_transactions, generation_jobs 에 직접 쓰거나 원장 내부 함수를 부르면 42501 이다", async () => {
    const { userId } = await devLogin();
    const statements: [string, unknown[]][] = [
      [
        "INSERT INTO gold_transactions (user_id, kind, idempotency_key, created_at) VALUES ($1, 'free_grant', $2, $3)",
        [userId, `db-test-${randomUUID()}`, NOW],
      ],
      [
        `INSERT INTO gold_entries (transaction_id, account_id, amount, created_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 100, $1)`,
        [NOW],
      ],
      [
        `INSERT INTO generation_jobs (user_id, idempotency_key, request_hash, input_manifest, payment_kind, created_at)
         VALUES ($1, 'x', 'x', '{}', 'trial', $2)`,
        [userId, NOW],
      ],
      ["UPDATE generation_jobs SET status = 'succeeded' WHERE user_id = $1", [userId]],
      // 원장 내부 함수는 SECURITY DEFINER 함수 안에서만 부른다.
      ["SELECT nuno_gold_open($1, $2)", [userId, NOW]],
    ];
    for (const [sql, params] of statements) {
      const error = await api.query(sql, params).catch((caught: unknown) => caught);
      expect({ sql, code: pgError(error) }).toEqual({ sql, code: "42501" });
    }
  });

  it("관리자라도 원장 줄과 거래를 고치거나 지우면 트리거가 막는다", async () => {
    const { userId } = await devLogin();
    const update = await admin
      .query(
        `UPDATE gold_entries SET amount = 800 WHERE account_id IN
           (SELECT id FROM gold_accounts WHERE user_id = $1 AND kind = 'trial')`,
        [userId],
      )
      .catch((caught: unknown) => caught);
    expect(pgError(update)).toBe("P0001");
    expect(String(update)).toMatch(/고치거나 지우지 않는다/);

    const remove = await admin
      .query("DELETE FROM gold_transactions WHERE user_id = $1", [userId])
      .catch((caught: unknown) => caught);
    expect(pgError(remove)).toBe("P0001");
    expect(await balance(userId, "trial")).toBe(8);
  });

  it("한 거래의 줄 합이 0 이 아니면 커밋 때 거절된다", async () => {
    const { userId } = await devLogin();
    const key = `db-test-unbalanced:${randomUUID()}`;
    const error = await admin
      .transaction(async (tx) => {
        const [row] = await tx.query<{ id: string }>(
          `INSERT INTO gold_transactions (user_id, kind, idempotency_key, created_at)
           VALUES ($1, 'free_grant', $2, $3) RETURNING id`,
          [userId, key, NOW],
        );
        await tx.query(
          `INSERT INTO gold_entries (transaction_id, account_id, amount, created_at)
           SELECT $1, id, 100, $3 FROM gold_accounts WHERE user_id = $2 AND kind = 'free_gold'`,
          [row?.id, userId, NOW],
        );
      })
      .catch((caught: unknown) => caught);
    expect(pgError(error)).toBe("23514");
    expect(
      await count("SELECT count(*)::int AS n FROM gold_transactions WHERE idempotency_key = $1", [
        key,
      ]),
    ).toBe(0);
  });
});

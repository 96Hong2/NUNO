import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeImageCheck } from "../adapters/fake-image-check.ts";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import { createLocalResultStore, type LocalResultStore } from "../adapters/local-result-store.ts";
import { openPostgres } from "../adapters/postgres.ts";
import { CONSENT_KIND, CONSENT_TEXT_VERSION } from "../account/consent.ts";
import { createApp } from "../app.ts";
import type { PushMessage } from "./ports.ts";
import { RESULT_URL_TTL_SECONDS } from "./signed-url.ts";
import {
  devProviderMode,
  LEASE_SECONDS,
  runNextJob,
  sweepJobs,
  type WorkerDeps,
} from "./worker.ts";

// 실제 Postgres 에 붙는 worker 시험. worker 는 가장 오래된 접수 작업부터 선점하므로,
// 이 파일은 다른 시험 파일(2030년)보다 이른 2020년 시각으로 접수하고, 접수한 작업은 모두 끝까지 돌린다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl, 10);
const admin = openPostgres(adminUrl);

const NOW = new Date("2020-02-01T01:00:00Z");
const SECRET = "db-test-file-secret";
const PUBLIC_URL = "http://api.test";
const pushed: PushMessage[] = [];
let resultDir = "";
let store: LocalResultStore;

const appAt = (at: Date) =>
  createApp(api, {
    devRoutes: true,
    now: () => at,
    results: store,
    files: { secret: SECRET, read: (key) => store.read(key) },
  });
let app: ReturnType<typeof createApp>;

function workerDeps(at = NOW, timeoutMs?: number): WorkerDeps {
  return {
    db: api,
    store,
    check: createFakeImageCheck(),
    push: {
      send: (message) => {
        pushed.push(message);
        return Promise.resolve();
      },
    },
    now: () => at,
    timeoutMs,
    async chooseProvider(job) {
      const mode = await devProviderMode(api, job.userId);
      return {
        provider: createFakeProvider(mode.mode, 0.04, { delayMs: mode.delayMs }),
        model: "fake",
        failCheckOnce: mode.failCheckOnce,
      };
    },
  };
}

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-worker-"));
  store = createLocalResultStore({ dir: resultDir, secret: SECRET, publicUrl: PUBLIC_URL });
  app = appAt(NOW);
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

interface JobView {
  jobId: string;
  status: string;
  paymentKind: string;
  failureCode: string | null;
  result: { url: string; expiresAt: string } | null;
  refund: { kind: string; amount: number } | null;
}

const call = async (
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
  target = app,
) =>
  target.request(path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function readyUser(): Promise<SignedIn> {
  const login = await call("/v1/dev/login", null, {
    method: "POST",
    body: { subject: `db-test-${randomUUID()}` },
  });
  const user = (await login.json()) as SignedIn;
  const consent = await call("/v1/consents", user.token, {
    method: "POST",
    body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
  });
  expect(consent.status).toBe(201);
  return user;
}

async function setProvider(
  token: string,
  mode: "succeed" | "refuse" | "hang",
  failCheckOnce = false,
) {
  const response = await call("/v1/dev/provider", token, {
    method: "POST",
    body: { mode, delayMs: 0, failCheckOnce },
  });
  expect(response.status).toBe(204);
}

async function submit(
  token: string,
): Promise<{ jobId: string; paymentKind: string; requestId: string }> {
  const requestId = `req-${randomUUID()}`;
  const response = await call("/v1/generation-jobs", token, {
    method: "POST",
    body: {
      requestId,
      manifest: { twin: { preset: "harin", version: 1 }, items: [randomUUID()] },
      consentVersion: CONSENT_TEXT_VERSION,
    },
  });
  expect(response.status).toBe(202);
  return { ...((await response.json()) as { jobId: string; paymentKind: string }), requestId };
}

/** 접수한 작업을 worker 로 끝까지 돌린다. 선점한 작업이 기대한 작업인지도 본다. */
async function runJob(jobId: string, deps = workerDeps()) {
  const done = await runNextJob(deps);
  expect(done?.jobId).toBe(jobId);
  return done?.outcome;
}

async function job(token: string, jobId: string, target = app): Promise<JobView> {
  const response = await call(`/v1/generation-jobs/${jobId}`, token, {}, target);
  expect(response.status).toBe(200);
  return (await response.json()) as JobView;
}

async function gold(token: string) {
  return (await (await call("/v1/gold", token)).json()) as {
    trialCount: number;
    balance: number;
    entries: { label: string; amount: number }[];
  };
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

/** 그 작업의 거래 하나(묶기, 확정, 풀기)가 계정 종류별로 얼마씩 움직였나. */
async function movements(jobId: string, kind: string): Promise<Record<string, number>> {
  const rows = await admin.query<{ kind: string; amount: number }>(
    `SELECT a.kind, sum(e.amount)::int AS amount
     FROM gold_transactions t
     JOIN gold_entries e ON e.transaction_id = t.id
     JOIN gold_accounts a ON a.id = e.account_id
     WHERE t.idempotency_key = $1
     GROUP BY a.kind`,
    [`${kind}:job:${jobId}`],
  );
  return Object.fromEntries(rows.map((row) => [row.kind, row.amount]));
}

describe("worker 한 바퀴", () => {
  it("가짜 공급사가 그림을 주면 succeeded 이고 결과 주소가 200, 「나가기」 뒤에는 같은 주소가 404 다", async () => {
    const { token, userId } = await readyUser();
    const { jobId, paymentKind, requestId } = await submit(token);
    expect(paymentKind).toBe("trial");
    const queued = await call(`/v1/generation-jobs/by-request/${requestId}`, token);
    expect(await queued.json()).toMatchObject({ jobId, status: "queued", result: null });
    expect(await runJob(jobId)).toBe("succeeded");
    expect(pushed).toContainEqual({ userId, jobId, status: "succeeded" });

    const view = await job(token, jobId);
    expect(view).toMatchObject({ status: "succeeded", failureCode: null, refund: null });
    expect(view.result?.expiresAt).toBe(
      new Date(NOW.getTime() + RESULT_URL_TTL_SECONDS * 1000).toISOString(),
    );
    const url = view.result?.url ?? "";
    const file = await app.request(url);
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await store.read(`gen30/${userId}/${jobId}-1.jpg`)).not.toBeNull();

    // 확정: 무료 장 몫은 promo_used 로 간다.
    expect(await movements(jobId, "capture")).toEqual({ hold: -4, promo_used: 4 });
    expect(await gold(token)).toMatchObject({ trialCount: 1, balance: 0 });

    const discard = await call(`/v1/generation-jobs/${jobId}/discard`, token, { method: "POST" });
    expect(discard.status).toBe(204);
    expect((await app.request(url)).status).toBe(404);
    expect((await job(token, jobId)).result).toBeNull();
    expect(
      (await call(`/v1/generation-jobs/${jobId}/discard`, token, { method: "POST" })).status,
    ).toBe(404);
  });

  it("무료 장 작업을 공급사가 거절하면 failed 와 풀기이고 무료 장과 골드는 그대로다", async () => {
    const { token, userId } = await readyUser();
    await setProvider(token, "refuse");
    const { jobId } = await submit(token);
    expect(await runJob(jobId)).toBe("failed");

    expect(await job(token, jobId)).toMatchObject({
      status: "failed",
      failureCode: "provider_refused",
      result: null,
      refund: { kind: "trial", amount: 4 },
    });
    expect(await gold(token)).toEqual({ trialCount: 2, balance: 0, entries: [] });
    expect(await balance(userId, "hold")).toBe(0);
    const attempts = await admin.query<{ status: string }>(
      "SELECT status FROM generation_attempts WHERE job_id = $1",
      [jobId],
    );
    expect(attempts).toEqual([{ status: "rejected" }]);
  });

  it("시험용 골드 20 으로 무료 둘을 다 쓴 뒤 골드 작업이 거절되면 잔액 20 과 「완성 룩 환불」 줄이 남는다", async () => {
    const { token } = await readyUser();
    await call("/v1/dev/gold", token, { method: "POST", body: { amount: 20 } });
    for (let i = 0; i < 2; i += 1) {
      const trial = await submit(token);
      expect(trial.paymentKind).toBe("trial");
      expect(await runJob(trial.jobId)).toBe("succeeded");
    }
    await setProvider(token, "refuse");
    const paid = await submit(token);
    expect(paid.paymentKind).toBe("gold");
    expect(await runJob(paid.jobId)).toBe("failed");

    expect((await job(token, paid.jobId)).refund).toEqual({ kind: "gold", amount: 4 });
    const summary = await gold(token);
    expect(summary).toMatchObject({ trialCount: 0, balance: 20 });
    expect(summary.entries.map(({ label, amount }) => ({ label, amount }))).toEqual([
      { label: "완성 룩 환불", amount: 4 },
      { label: "완성 룩 1장", amount: -4 },
      { label: "시험용 골드", amount: 20 },
    ]);
  });

  it("첫 검사에서 떨어지면 한 번만 다시 만들어 round 2 결과로 succeeded 가 되고 첫 파일은 지운다", async () => {
    const { token, userId } = await readyUser();
    await setProvider(token, "succeed", true);
    const { jobId } = await submit(token);
    expect(await runJob(jobId)).toBe("succeeded");

    const attempts = await admin.query<{ round: number; status: string }>(
      "SELECT round, status FROM generation_attempts WHERE job_id = $1 ORDER BY round",
      [jobId],
    );
    expect(attempts).toEqual([
      { round: 1, status: "completed" },
      { round: 2, status: "completed" },
    ]);
    expect(await store.read(`gen30/${userId}/${jobId}-1.jpg`)).toBeNull();
    expect(await store.read(`gen30/${userId}/${jobId}-2.jpg`)).not.toBeNull();
    expect((await job(token, jobId)).result?.url).toContain(`${jobId}-2.jpg`);
  });

  it("무상 2와 유상 2를 섞어 묶은 작업을 확정하면 무상 몫은 promo_used, 유상 몫은 revenue 로 간다", async () => {
    const { token, userId } = await readyUser();
    for (let i = 0; i < 2; i += 1) {
      const trial = await submit(token);
      expect(await runJob(trial.jobId)).toBe("succeeded");
    }
    await call("/v1/dev/gold", token, { method: "POST", body: { amount: 2 } });
    // 충전(T8) 전이라 유상 골드는 관리자가 원장에 직접 넣는다.
    await admin.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `INSERT INTO gold_transactions (user_id, kind, idempotency_key, memo, created_at)
         VALUES ($1, 'free_grant', $2, '시험 유상 골드', $3) RETURNING id`,
        [userId, `db-test-paid:${randomUUID()}`, NOW],
      );
      await tx.query(
        `INSERT INTO gold_entries (transaction_id, account_id, amount, created_at)
         SELECT $1, a.id, CASE WHEN a.user_id IS NULL THEN -2 ELSE 2 END, $3
         FROM gold_accounts a
         WHERE (a.user_id = $2 AND a.kind = 'paid_gold') OR (a.user_id IS NULL AND a.kind = 'promo_grant')`,
        [row?.id, userId, NOW],
      );
    });

    const mixed = await submit(token);
    expect(mixed.paymentKind).toBe("gold");
    expect(await movements(mixed.jobId, "hold")).toEqual({ free_gold: -2, paid_gold: -2, hold: 4 });
    expect(await runJob(mixed.jobId)).toBe("succeeded");
    expect(await movements(mixed.jobId, "capture")).toEqual({
      hold: -4,
      promo_used: 2,
      revenue: 2,
    });
  });

  it("공급사가 시한 안에 답하지 않으면 무응답 시도로 적고 failed 와 풀기다", async () => {
    const { token, userId } = await readyUser();
    await setProvider(token, "hang");
    const { jobId } = await submit(token);
    expect(await runJob(jobId, workerDeps(NOW, 50))).toBe("failed");
    expect((await job(token, jobId)).failureCode).toBe("provider_timeout");
    const attempts = await admin.query<{ status: string; billing_status: string }>(
      "SELECT status, billing_status FROM generation_attempts WHERE job_id = $1",
      [jobId],
    );
    expect(attempts).toEqual([{ status: "unknown", billing_status: "unknown" }]);
    expect(await balance(userId, "trial")).toBe(8);
  });
});

describe("무료 하루 한도", () => {
  it("무료 접수는 한국 날짜 하루 4건까지이고 한국 자정이 지나면 다시 된다", async () => {
    const { token, userId } = await readyUser();
    await setProvider(token, "refuse");
    const submitAt = async (at: string) => {
      const [row] = await api.query<{ job_id: string | null; error_code: string | null }>(
        "SELECT job_id, error_code FROM nuno_submit_job($1, $2, $3, $4, $5, $6)",
        [userId, `req-${randomUUID()}`, "hash", "{}", CONSENT_TEXT_VERSION, new Date(at)],
      );
      return row;
    };
    // 2020-03-01 한국 시간 10시부터 네 건. 거절로 무료 장이 돌아와 잔액은 늘 8 이다.
    for (const minute of ["01", "02", "03", "04"]) {
      const row = await submitAt(`2020-03-01T01:${minute}:00Z`);
      expect(row?.error_code).toBeNull();
      expect(await runJob(row?.job_id ?? "")).toBe("failed");
    }
    expect((await submitAt("2020-03-01T14:59:59Z"))?.error_code).toBe("trial_daily_limit");

    const nextDay = await submitAt("2020-03-01T15:00:00Z");
    expect(nextDay?.error_code).toBeNull();
    expect(await runJob(nextDay?.job_id ?? "")).toBe("failed");
  });
});

describe("선점 기한과 예약 작업(worker 가 도중에 죽은 경우)", () => {
  it("기한이 지나면 예약 작업이 실패와 풀기로 끝내고, 같은 선점 토큰으로 늦게 완료를 불러도 아무것도 바뀌지 않는다", async () => {
    const { token, userId } = await readyUser();
    const { jobId } = await submit(token);
    const lease = randomUUID();
    const [claimed] = await api.query<{ job_id: string }>(
      "SELECT job_id FROM nuno_claim_job($1, $2, $3)",
      [lease, LEASE_SECONDS, NOW],
    );
    expect(claimed?.job_id).toBe(jobId);
    const [attempt] = await api.query<{ id: string }>(
      "SELECT nuno_start_attempt($1, $2, 'fake', 'fake', $3) AS id",
      [jobId, lease, NOW],
    );
    expect(attempt?.id).toBeTruthy();
    const key = `gen30/${userId}/${jobId}-1.jpg`;
    await store.put(key, new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
    await api.query("SELECT nuno_job_checking($1, $2, $3, $4)", [jobId, lease, key, NOW]);
    expect(await balance(userId, "hold")).toBe(4);

    // 기한 안에는 예약 작업이 건드리지 않는다.
    const early = new Date(NOW.getTime() + (LEASE_SECONDS - 1) * 1000);
    expect(await sweepJobs(workerDeps(early))).toBe(0);

    const late = new Date(NOW.getTime() + LEASE_SECONDS * 1000);
    expect(await sweepJobs(workerDeps(late))).toBe(1);
    expect(pushed).toContainEqual({ userId, jobId, status: "failed" });
    expect(await store.read(key)).toBeNull();
    expect(await job(token, jobId)).toMatchObject({
      status: "failed",
      failureCode: "lease_expired",
      refund: { kind: "trial", amount: 4 },
    });
    expect(await balance(userId, "trial")).toBe(8);

    for (const at of [NOW, late]) {
      const [row] = await api.query<{ ok: boolean }>("SELECT nuno_job_succeed($1, $2, $3) AS ok", [
        jobId,
        lease,
        at,
      ]);
      expect(row?.ok).toBe(false);
    }
    const [fail] = await api.query<{ failed: boolean }>(
      "SELECT failed FROM nuno_job_fail($1, $2, 'late', $3)",
      [jobId, lease, NOW],
    );
    expect(fail?.failed).toBe(false);
    expect((await job(token, jobId)).status).toBe("failed");
    expect(await balance(userId, "trial")).toBe(8);
    expect(await balance(userId, "hold")).toBe(0);
    expect(await movements(jobId, "capture")).toEqual({});
  });
});

describe("결과 저장과 남의 것", () => {
  it("「내 룩북에 저장」 을 연타해도 룩은 하나이고 파일은 저장 자리로 옮겨지며, 저장한 결과는 나가기로 지우지 못한다", async () => {
    const { token, userId } = await readyUser();
    const { jobId } = await submit(token);
    expect(await runJob(jobId)).toBe("succeeded");

    const keep = () =>
      call(`/v1/generation-jobs/${jobId}/keep`, token, {
        method: "POST",
        body: { wornItems: [{ id: "w18", name: "니트" }] },
      });
    const responses = await Promise.all([keep(), keep(), keep()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const ids = (await Promise.all(responses.map((response) => response.json()))) as {
      lookId: string;
    }[];
    expect(new Set(ids.map((body) => body.lookId)).size).toBe(1);

    const [result] = await admin.query<{ id: string; r2_key: string; storage_state: string }>(
      "SELECT id, r2_key, storage_state FROM generation_results WHERE job_id = $1",
      [jobId],
    );
    expect(result).toMatchObject({
      storage_state: "kept",
      r2_key: `u/${userId}/looks/${result?.id}.jpg`,
    });
    const looks = await admin.query<{ lookbook_id: string | null; worn_items: unknown }>(
      "SELECT lookbook_id, worn_items FROM looks WHERE result_id = $1",
      [result?.id],
    );
    expect(looks).toEqual([{ lookbook_id: null, worn_items: [{ id: "w18", name: "니트" }] }]);
    expect(await store.read(`gen30/${userId}/${jobId}-1.jpg`)).toBeNull();

    const url = (await job(token, jobId)).result?.url ?? "";
    expect(url).toContain(`/v1/files/u/${userId}/looks/`);
    expect((await app.request(url)).status).toBe(200);
    expect(
      (await call(`/v1/generation-jobs/${jobId}/discard`, token, { method: "POST" })).status,
    ).toBe(404);
    expect((await app.request(url)).status).toBe(200);
  });

  it("A 세션으로 B 의 작업을 조회, 저장, 나가기 하면 404 이고, A 의 룩을 B 의 룩북으로 옮기면 키 오류다", async () => {
    const a = await readyUser();
    const b = await readyUser();
    const aJob = await submit(a.token);
    const bJob = await submit(b.token);
    const done = [await runNextJob(workerDeps()), await runNextJob(workerDeps())];
    expect(done.map((item) => item?.jobId).sort()).toEqual([aJob.jobId, bJob.jobId].sort());

    expect((await call(`/v1/generation-jobs/${bJob.jobId}`, a.token)).status).toBe(404);
    const byRequest = await call(`/v1/generation-jobs/by-request/${bJob.requestId}`, a.token);
    expect(byRequest.status).toBe(404);
    const keep = await call(`/v1/generation-jobs/${bJob.jobId}/keep`, a.token, {
      method: "POST",
      body: { wornItems: [] },
    });
    expect(keep.status).toBe(404);
    const discard = await call(`/v1/generation-jobs/${bJob.jobId}/discard`, a.token, {
      method: "POST",
    });
    expect(discard.status).toBe(404);
    expect((await job(b.token, bJob.jobId)).result).not.toBeNull();

    const kept = await call(`/v1/generation-jobs/${aJob.jobId}/keep`, a.token, {
      method: "POST",
      body: { wornItems: [] },
    });
    const { lookId } = (await kept.json()) as { lookId: string };
    const [bBook] = await api.query<{ id: string }>(
      "INSERT INTO lookbooks (user_id, title, created_at) VALUES ($1, '겨울 여행', $2) RETURNING id",
      [b.userId, NOW],
    );
    const move = await api
      .query("UPDATE looks SET lookbook_id = $1 WHERE id = $2", [bBook?.id, lookId])
      .catch((caught: unknown) => caught);
    expect(pgError(move)).toBe("23503");

    const [bResult] = await admin.query<{ id: string }>(
      "SELECT id FROM generation_results WHERE job_id = $1",
      [bJob.jobId],
    );
    const steal = await api
      .query("INSERT INTO looks (user_id, result_id, saved_at) VALUES ($1, $2, $3)", [
        a.userId,
        bResult?.id,
        NOW,
      ])
      .catch((caught: unknown) => caught);
    expect(pgError(steal)).toBe("23503");
  });
});

describe("결과 서명 주소", () => {
  it("서명을 바꾸거나, 다른 키에 쓰거나, 기한이 지나거나, 키가 폴더 밖을 가리키면 403 이다", async () => {
    const { token, userId } = await readyUser();
    const { jobId } = await submit(token);
    expect(await runJob(jobId)).toBe("succeeded");
    const url = new URL((await job(token, jobId)).result?.url ?? "");
    const sig = url.searchParams.get("sig") ?? "";
    const exp = url.searchParams.get("exp") ?? "";
    expect((await app.request(url.toString())).status).toBe(200);

    const forged = new URL(url);
    forged.searchParams.set("sig", `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`);
    expect((await app.request(forged.toString())).status).toBe(403);

    const longer = new URL(url);
    longer.searchParams.set("exp", String(Number(exp) + 3600));
    expect((await app.request(longer.toString())).status).toBe(403);

    const otherKey = `${PUBLIC_URL}/v1/files/gen30/${userId}/other.jpg?exp=${exp}&sig=${sig}`;
    expect((await app.request(otherKey)).status).toBe(403);

    const later = appAt(new Date(NOW.getTime() + RESULT_URL_TTL_SECONDS * 1000));
    expect((await later.request(url.toString())).status).toBe(403);

    for (const path of [
      `/v1/files/gen30%2F..%2F..%2Fetc%2Fpasswd?exp=${exp}&sig=${sig}`,
      `/v1/files/gen30/..%2Fsecret?exp=${exp}&sig=${sig}`,
      `/v1/files/%2Fetc%2Fpasswd?exp=${exp}&sig=${sig}`,
    ]) {
      expect((await app.request(path)).status).toBe(403);
    }
  });
});

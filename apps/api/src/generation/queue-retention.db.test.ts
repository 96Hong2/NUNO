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
import { keptResultKey } from "../lookbook/keep-result.ts";
import type { PushMessage, ResultStore } from "./ports.ts";
import type { GenerationProvider } from "./provider.ts";
import {
  expireQueuedJobs,
  expireResults,
  LEASE_SECONDS,
  QUEUE_WAIT_SECONDS,
  runNextJob,
  sweepJobs,
  type WorkerDeps,
} from "./worker.ts";

// 접수 대기 상한, 늦은 결과 저장, 저장하지 않은 결과의 보관 기한 시험. 실제 Postgres 에 붙는다.
// worker 는 p_now 와 상관없이 가장 오래된 접수 작업부터 선점한다. 시험마다 2023년의 서로 다른 한국 날짜로 접수하고,
// 선점 전에 그 시각으로 대기 만료를 불러 그보다 앞서 남은 접수 작업을 비운다. 선점한 작업이 자기 작업인지 먼저 단언한다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const SEED_PROVIDER = `db-test-queue-${randomUUID()}`;
const SECRET = "db-test";
const DAY_MS = 24 * 60 * 60 * 1000;
let resultDir = "";
let store: LocalResultStore;
const pushed: PushMessage[] = [];
const push = {
  send: (message: PushMessage) => {
    pushed.push(message);
    return Promise.resolve();
  },
};

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-queue-"));
  store = createLocalResultStore({ dir: resultDir, secret: SECRET, publicUrl: "http://api.test" });
  await setSwitch(true);
  await admin.query(
    `INSERT INTO provider_configs
       (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
     VALUES ($1, 'm', '1', 'sync', 2, '시험 나라', 1, 0, true)`,
    [SEED_PROVIDER],
  );
});

afterAll(async () => {
  await setSwitch(false);
  await admin.query("DELETE FROM provider_configs WHERE provider = $1", [SEED_PROVIDER]);
  await api.close();
  await admin.close();
  await rm(resultDir, { recursive: true, force: true });
});

async function setSwitch(enabled: boolean) {
  await admin.query("UPDATE feature_switches SET enabled = $1 WHERE key = 'generate_look'", [
    enabled,
  ]);
}

const plus = (at: Date, ms: number) => new Date(at.getTime() + ms);

/** 공급사를 부른 횟수를 세는 worker. 시각은 clock.now 를 바꿔 앞으로 돌린다. */
function countingWorker(start: Date, resultStore: ResultStore = store) {
  const clock = { now: start, calls: 0 };
  const fake = createFakeProvider("succeed", 0.04);
  const provider: GenerationProvider = {
    name: fake.name,
    generate(request, signal) {
      clock.calls += 1;
      return fake.generate(request, signal);
    },
  };
  const deps: WorkerDeps = {
    db: api,
    store: resultStore,
    check: createFakeImageCheck(),
    push,
    now: () => clock.now,
    chooseProvider: (job) =>
      Promise.resolve({
        provider,
        model: job.providerConfig?.model ?? "none",
        failCheckOnce: false,
      }),
  };
  return { deps, clock };
}

/** worker 의 1초 바퀴와 같은 차례: 대기 만료 다음 선점. */
async function tick(deps: WorkerDeps, token?: string) {
  await expireQueuedJobs(deps);
  return runNextJob(deps, token);
}

interface SignedIn {
  token: string;
  userId: string;
}

/** 그 시각의 API. 가입, 동의, 접수, 조회, 저장, 결과 파일 열기를 그 시각으로 한다. */
function apiAt(now: Date) {
  const app = createApp(api, {
    devRoutes: true,
    now: () => now,
    results: store,
    files: { secret: SECRET, read: (key) => store.read(key) },
  });
  const call = (
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

  return {
    now,
    async readyUser(): Promise<SignedIn> {
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
    },
    async submit(token: string, payWith?: "trial" | "gold"): Promise<string> {
      const response = await call("/v1/generation-jobs", token, {
        method: "POST",
        body: {
          requestId: `req-${randomUUID()}`,
          manifest: { twin: { preset: "harin", version: 1 }, items: [randomUUID()] },
          consentVersion: CONSENT_TEXT_VERSION,
          ...(payWith ? { payWith } : {}),
        },
      });
      expect(response.status).toBe(202);
      return ((await response.json()) as { jobId: string }).jobId;
    },
    async view(token: string, jobId: string) {
      const response = await call(`/v1/generation-jobs/${jobId}`, token);
      expect(response.status).toBe(200);
      return (await response.json()) as { status: string; result: { url: string } | null } & Record<
        string,
        unknown
      >;
    },
    keep: (token: string, jobId: string) =>
      call(`/v1/generation-jobs/${jobId}/keep`, token, {
        method: "POST",
        body: { wornItems: [] },
      }),
    /** 서명 주소를 이 API 로 연다. */
    open: (url: string) => {
      const parsed = new URL(url);
      return call(`${parsed.pathname}${parsed.search}`, null);
    },
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

async function jobRow(jobId: string) {
  const [row] = await admin.query<{ status: string; failure_code: string | null }>(
    "SELECT status, failure_code FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  return row;
}

const attemptCount = async (jobId: string) =>
  (
    await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM generation_attempts WHERE job_id = $1",
      [jobId],
    )
  )[0]?.n;

async function holdStatus(jobId: string) {
  const [row] = await admin.query<{ status: string }>(
    "SELECT status FROM gold_holds WHERE ref_kind = 'generation_job' AND ref_id = $1",
    [jobId],
  );
  return row?.status;
}

async function resultRow(jobId: string) {
  const [row] = await admin.query<{
    id: string;
    r2_key: string;
    storage_state: string;
    delete_due_at: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT id, r2_key, storage_state, delete_due_at, deleted_at
     FROM generation_results WHERE job_id = $1`,
    [jobId],
  );
  return row;
}

/** 그 사용자의 골드 원장 거래 수와 기록 줄 수. */
async function ledgerCounts(userId: string) {
  const [row] = await admin.query<{ transactions: number; entries: number }>(
    `SELECT (SELECT count(*)::int FROM gold_transactions WHERE user_id = $1) AS transactions,
            (SELECT count(*)::int FROM gold_entries e JOIN gold_transactions t ON t.id = e.transaction_id
             WHERE t.user_id = $1) AS entries`,
    [userId],
  );
  return row;
}

/** 접수한 작업 하나를 끝까지 돌려 succeeded 로 만든다. */
async function runToSuccess(at: Date, jobId: string) {
  const { deps } = countingWorker(at);
  expect(await tick(deps)).toEqual({ jobId, outcome: "succeeded" });
}

describe("접수 뒤 대기 상한", () => {
  it("대기 상한은 5분이다", () => {
    expect(QUEUE_WAIT_SECONDS).toBe(5 * 60);
  });

  it("5분을 넘긴 접수 작업은 공급사 호출 없이 queue_timeout 으로 실패하고 골드가 돌아온다. 4분 59초에는 그대로 접수 상태다", async () => {
    const submittedAt = new Date("2023-03-01T01:00:00Z");
    const first = apiAt(submittedAt);
    const late = await first.readyUser();
    await api.query("SELECT nuno_grant_test_gold($1, 4, $2)", [late.userId, submittedAt]);
    const lateJob = await first.submit(late.token, "gold");
    expect(await balance(late.userId, "free_gold")).toBe(0);
    expect(await balance(late.userId, "hold")).toBe(4);

    // 4분 59초: 아직 상한 안이라 대기 만료가 이 작업을 끝내지 않는다.
    const almost = plus(submittedAt, (5 * 60 - 1) * 1000);
    await expireQueuedJobs({ db: api, push, now: () => almost });
    expect(await jobRow(lateJob)).toEqual({ status: "queued", failure_code: null });

    // 3분 20초 뒤에 접수한 다른 사용자의 작업은 5분 1초 시점에도 상한 안이다.
    const second = apiAt(plus(submittedAt, 200 * 1000));
    const fresh = await second.readyUser();
    const freshJob = await second.submit(fresh.token);

    const over = plus(submittedAt, (5 * 60 + 1) * 1000);
    const { deps, clock } = countingWorker(over);
    const done = await tick(deps);

    // 선점은 상한을 넘긴 작업을 건너뛰고 상한 안의 작업만 공급사로 보낸다.
    expect(done).toEqual({ jobId: freshJob, outcome: "succeeded" });
    expect(clock.calls).toBe(1);
    expect(await jobRow(lateJob)).toEqual({ status: "failed", failure_code: "queue_timeout" });
    expect(await attemptCount(lateJob)).toBe(0);
    expect(await holdStatus(lateJob)).toBe("released");
    expect(await balance(late.userId, "free_gold")).toBe(4);
    expect(await balance(late.userId, "hold")).toBe(0);
    expect(pushed).toContainEqual({ userId: late.userId, jobId: lateJob, status: "failed" });
    expect(await apiAt(over).view(late.token, lateJob)).toMatchObject({
      status: "failed",
      failureCode: "queue_timeout",
      result: null,
      refund: { kind: "gold", amount: 4 },
    });

    // 한 번 끝낸 작업은 다시 부를 때 바뀌지 않는다. 원장 거래가 늘지 않는다.
    const ledger = await ledgerCounts(late.userId);
    await expireQueuedJobs({ db: api, push, now: () => plus(over, 60 * 1000) });
    expect(await ledgerCounts(late.userId)).toEqual(ledger);
    expect(pushed.filter((message) => message.jobId === lateJob)).toHaveLength(1);
  });

  it("대기 상한이 0초 이하면 접수 작업을 건드리지 않고 오류를 낸다", async () => {
    const at = new Date("2023-03-02T01:00:00Z");
    await expect(
      api.query("SELECT * FROM nuno_expire_next_queued_job($1, 0)", [at]),
    ).rejects.toThrow(/대기 상한/);
  });
});

describe("선점 기한이 지난 시도의 늦은 결과 저장", () => {
  it("늦게 저장된 사진은 지워지고, 같은 사용자의 정상 결과 파일과 골드 원장은 바뀌지 않는다", async () => {
    const at = new Date("2023-04-01T01:00:00Z");
    const day = apiAt(at);
    const { userId, token } = await day.readyUser();

    const normalJob = await day.submit(token);
    await runToSuccess(at, normalJob);
    const normalBefore = await resultRow(normalJob);
    expect(normalBefore?.storage_state).toBe("gen30");
    const normalBytes = await store.read(normalBefore?.r2_key ?? "");
    expect(normalBytes).not.toBeNull();

    // 사진을 올리는 사이에 선점 기한이 지나 예약 작업이 그 작업을 먼저 끝낸 경우다.
    const lateJob = await day.submit(token);
    const lateKey = `gen30/${userId}/${lateJob}-1.jpg`;
    const afterLease = plus(at, (LEASE_SECONDS + 1) * 1000);
    let ledgerAfterSweep: Awaited<ReturnType<typeof ledgerCounts>> | undefined;
    let swept = 0;
    let fileWhileLate: Uint8Array | null = null;
    const slowStore: ResultStore = {
      ...store,
      async put(key, bytes, contentType) {
        await store.put(key, bytes, contentType);
        clock.now = afterLease;
        swept = await sweepJobs({ db: api, store, push, now: () => afterLease });
        ledgerAfterSweep = await ledgerCounts(userId);
        fileWhileLate = await store.read(key);
      },
    };
    const { deps, clock } = countingWorker(at, slowStore);
    const firstToken = randomUUID();
    const done = await tick(deps, firstToken);

    expect(done).toEqual({ jobId: lateJob, outcome: "lost" });
    expect(clock.calls).toBe(1);
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(fileWhileLate).not.toBeNull();
    expect(await store.read(lateKey)).toBeNull();
    expect(await jobRow(lateJob)).toEqual({ status: "failed", failure_code: "lease_expired" });
    expect(await resultRow(lateJob)).toBeUndefined();
    expect(await holdStatus(lateJob)).toBe("released");

    // 옛 선점 토큰으로 부르는 늦은 호출은 아무것도 바꾸지 못한다.
    const [checking] = await api.query<{ id: string | null }>(
      "SELECT nuno_job_checking($1, $2, $3, $4) AS id",
      [lateJob, firstToken, lateKey, afterLease],
    );
    expect(checking?.id).toBeNull();
    const [succeeded] = await api.query<{ ok: boolean }>(
      "SELECT nuno_job_succeed($1, $2, $3) AS ok",
      [lateJob, firstToken, afterLease],
    );
    expect(succeeded?.ok).toBe(false);
    expect(await resultRow(lateJob)).toBeUndefined();

    expect(ledgerAfterSweep).toBeDefined();
    expect(await ledgerCounts(userId)).toEqual(ledgerAfterSweep);
    expect(await resultRow(normalJob)).toEqual(normalBefore);
    expect(await store.read(normalBefore?.r2_key ?? "")).toEqual(normalBytes);
    expect(await balance(userId, "trial")).toBe(4);
    expect(await balance(userId, "hold")).toBe(0);
    expect(pushed.filter((message) => message.jobId === lateJob)).toEqual([
      { userId, jobId: lateJob, status: "failed" },
    ]);
  });
});

describe("저장하지 않은 결과의 보관 기한 30일", () => {
  it("기한이 지나면 조회가 주소를 주지 않고 저장을 거절하며, 정리 뒤에는 파일이 열리지 않고 DB 도 삭제 상태다", async () => {
    const at = new Date("2023-05-01T01:00:00Z");
    const day = apiAt(at);
    const { userId, token } = await day.readyUser();
    const unsavedJob = await day.submit(token);
    await runToSuccess(at, unsavedJob);
    const savedJob = await day.submit(token);
    await runToSuccess(at, savedJob);
    expect((await day.keep(token, savedJob)).status).toBe(200);

    const unsaved = await resultRow(unsavedJob);
    const saved = await resultRow(savedJob);
    if (!unsaved || !saved) throw new Error("결과 행이 없다");
    expect(unsaved.storage_state).toBe("gen30");
    expect(unsaved.delete_due_at?.getTime()).toBe(at.getTime() + 30 * DAY_MS);
    expect(saved).toMatchObject({ storage_state: "kept", delete_due_at: null });
    expect(saved.r2_key).toBe(keptResultKey(userId, saved.id));

    // 기한 1초 전에는 아직 열린다.
    const before = apiAt(plus(at, 30 * DAY_MS - 1000));
    const stillOpen = await before.view(token, unsavedJob);
    expect(stillOpen.result).not.toBeNull();
    expect((await before.open(stillOpen.result?.url ?? "")).status).toBe(200);

    // 기한 1초 뒤, 정리 전: 조회는 주소를 주지 않고 저장은 404 다. 복사본도 만들지 않는다.
    const later = plus(at, 30 * DAY_MS + 1000);
    const after = apiAt(later);
    expect(await after.view(token, unsavedJob)).toMatchObject({
      status: "succeeded",
      result: null,
    });
    expect((await after.keep(token, unsavedJob)).status).toBe(404);
    expect(await store.read(keptResultKey(userId, unsaved.id))).toBeNull();
    const [direct] = await api.query<{ look_id: string | null }>(
      "SELECT nuno_keep_result($1, $2, $3, $4, $5) AS look_id",
      [userId, unsavedJob, keptResultKey(userId, unsaved.id), "[]", later],
    );
    expect(direct?.look_id).toBeNull();
    expect((await resultRow(unsavedJob))?.storage_state).toBe("gen30");
    expect(await store.read(unsaved.r2_key)).not.toBeNull();

    // 정리: 파일을 지우고 DB 를 deleted 로 적는다. 다른 파일이 남긴 결과가 앞에 있을 수 있어 0 이 될 때까지 돈다.
    let removed = 0;
    for (let round = 0; round < 20; round += 1) {
      const count = await expireResults({ db: api, store, now: () => later });
      removed += count;
      if (count === 0) break;
    }
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await resultRow(unsavedJob)).toMatchObject({
      storage_state: "deleted",
      deleted_at: later,
    });
    expect(await store.read(unsaved.r2_key)).toBeNull();
    const unsavedUrl = await store.signedUrl(unsaved.r2_key, later);
    expect((await after.open(unsavedUrl.url)).status).toBe(404);
    expect((await after.keep(token, unsavedJob)).status).toBe(404);
    const [looks] = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM looks WHERE result_id = $1",
      [unsaved.id],
    );
    expect(looks?.n).toBe(0);

    // 룩북에 저장한 결과는 30일 정리에서 빠진다.
    expect(await resultRow(savedJob)).toEqual(saved);
    const savedUrl = await store.signedUrl(saved.r2_key, later);
    expect((await after.open(savedUrl.url)).status).toBe(200);
    expect((await after.view(token, savedJob)).result).not.toBeNull();
  });
});

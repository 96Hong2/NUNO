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
import type { GenerationProvider } from "./provider.ts";
import { LEASE_SECONDS, runNextJob, settleBudgets, sweepJobs, type WorkerDeps } from "./worker.ts";

// 하루 생성 예산의 예약과 정산 시험. 실제 Postgres 에 붙고, 예산 행과 시도 줄은 관리자로 읽고 바꾼다.
// worker 는 가장 오래된 접수 작업부터 선점한다. 시험마다 2022년의 서로 다른 한국 날짜로 접수하고 끝까지 돌린다.
// 덤프로 옮긴 DB 에서도 같은 시험을 돌므로 예산 행은 절댓값이 아니라 시험 전후 차이로 본다.
// 예산 상한을 바꾼 시험은 끝나면 그 날짜 행의 상한을 되돌린다. 기본값 표는 바꾸지 않는다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const SEED_PROVIDER = `db-test-budget-${randomUUID()}`;
/** 시드 설정 줄의 한 장 값과 가짜 공급사의 청구액(달러). 예산 행은 1만분의 1달러 정수로 읽는다. */
const PRICE_USD = 0.04;
const PRICE = 400;
let resultDir = "";
let store: LocalResultStore;
const pushed: PushMessage[] = [];

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-budget-"));
  store = createLocalResultStore({
    dir: resultDir,
    secret: "db-test",
    publicUrl: "http://api.test",
  });
  await setSwitch(true);
  await admin.query(
    `INSERT INTO provider_configs
       (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
     VALUES ($1, 'm', '1', 'sync', 2, '시험 나라', 1, $2, true)`,
    [SEED_PROVIDER, PRICE_USD],
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

/** 공급사를 부른 횟수를 세는 가짜 공급사. 청구액은 한 장 값과 같다. */
function countingWorker(at: Date) {
  const seen = { calls: 0 };
  const fake = createFakeProvider("succeed", PRICE_USD);
  const provider: GenerationProvider = {
    name: fake.name,
    generate(request, signal) {
      seen.calls += 1;
      return fake.generate(request, signal);
    },
  };
  const deps: WorkerDeps = {
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
    chooseProvider: (job) =>
      Promise.resolve({
        provider,
        model: job.providerConfig?.model ?? "none",
        failCheckOnce: false,
      }),
  };
  return { deps, seen };
}

interface SignedIn {
  token: string;
  userId: string;
}

/** 그 시각의 API. 가입과 동의와 접수를 그 시각으로 한다. */
function apiAt(at: string) {
  const now = new Date(at);
  const app = createApp(api, { devRoutes: true, now: () => now, results: store });
  const call = (path: string, token: string | null, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function readyUser(): Promise<SignedIn> {
    const login = await call("/v1/dev/login", null, { subject: `db-test-${randomUUID()}` });
    const user = (await login.json()) as SignedIn;
    const consent = await call("/v1/consents", user.token, {
      kind: CONSENT_KIND,
      textVersion: CONSENT_TEXT_VERSION,
    });
    expect(consent.status).toBe(201);
    return user;
  }

  async function submit(token: string): Promise<string> {
    const response = await call("/v1/generation-jobs", token, {
      requestId: `req-${randomUUID()}`,
      manifest: { twin: { preset: "harin", version: 1 }, items: [randomUUID()] },
      consentVersion: CONSENT_TEXT_VERSION,
    });
    expect(response.status).toBe(202);
    return ((await response.json()) as { jobId: string }).jobId;
  }

  async function view(token: string, jobId: string) {
    const response = await call(`/v1/generation-jobs/${jobId}`, token);
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  }

  return { now, readyUser, submit, view };
}

interface BudgetRow {
  budget: number;
  reserved: number;
  settled: number;
}

/** 그 한국 날짜의 하루 전체 예산 행. 없으면 기본값으로 만든다. 값은 1만분의 1달러 정수다. */
async function budgetRow(day: string): Promise<BudgetRow> {
  await admin.query(
    `INSERT INTO cost_daily (day, budget_kind, provider, budget_usd, updated_at)
     SELECT $1::date, 'total', '', coalesce(
       (SELECT budget_usd FROM cost_budget_defaults WHERE budget_kind = 'total' AND provider = ''), 0
     ), now()
     ON CONFLICT (day, budget_kind, provider) DO NOTHING`,
    [day],
  );
  const [row] = await admin.query<BudgetRow>(
    `SELECT (budget_usd * 10000)::int AS budget, (reserved_usd * 10000)::int AS reserved,
            (settled_usd * 10000)::int AS settled
     FROM cost_daily WHERE day = $1::date AND budget_kind = 'total' AND provider = ''`,
    [day],
  );
  if (!row) throw new Error(`${day} 예산 행이 없다`);
  return row;
}

/** 그 날짜의 상한을 바꿔 work 를 돌리고, 끝나면 원래 상한으로 되돌린다. */
async function withBudget(day: string, budget: number, work: () => Promise<void>) {
  const before = await budgetRow(day);
  const setBudget = (value: number) =>
    admin.query(
      `UPDATE cost_daily SET budget_usd = $2::numeric / 10000
       WHERE day = $1::date AND budget_kind = 'total' AND provider = ''`,
      [day, value],
    );
  await setBudget(budget);
  try {
    await work();
  } finally {
    await setBudget(before.budget);
  }
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

const attempts = (jobId: string) =>
  admin.query<{ id: string; budget_status: string | null; reserved: number | null }>(
    `SELECT id, budget_status, (reserved_usd * 10000)::int AS reserved
     FROM generation_attempts WHERE job_id = $1 ORDER BY round`,
    [jobId],
  );

async function jobRow(jobId: string) {
  const [row] = await admin.query<{ status: string; failure_code: string | null }>(
    "SELECT status, failure_code FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  return row;
}

async function holdStatus(jobId: string) {
  const [row] = await admin.query<{ status: string }>(
    "SELECT status FROM gold_holds WHERE ref_kind = 'generation_job' AND ref_id = $1",
    [jobId],
  );
  return row?.status;
}

/** 정산 문장이 잠금을 기다릴 때까지 기다린다. 10초 안에 기다리지 않으면 멈춘다. */
async function waitForSettleLockWait() {
  for (let tries = 0; tries < 200; tries += 1) {
    const [row] = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE state = 'active' AND wait_event_type = 'Lock' AND query LIKE '%nuno_settle%'`,
    );
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("정산이 사용자 행을 기다리지 않았다");
}

describe("하루 생성 예산", () => {
  it("그날 예산이 0원이면 worker 는 공급사를 부르지 않고 시도 줄 없이 budget_exhausted 로 실패하며 묶인 무료 장이 돌아온다", async () => {
    const day = "2022-02-01";
    const at = apiAt("2022-02-01T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const jobId = await at.submit(token);
    expect(await balance(userId, "trial")).toBe(4);
    expect(await balance(userId, "hold")).toBe(4);

    await withBudget(day, 0, async () => {
      const before = await budgetRow(day);
      const { deps, seen } = countingWorker(at.now);
      expect(await runNextJob(deps)).toEqual({ jobId, outcome: "failed" });
      expect(seen.calls).toBe(0);
      expect(await attempts(jobId)).toEqual([]);
      expect(await jobRow(jobId)).toEqual({ status: "failed", failure_code: "budget_exhausted" });
      expect(await holdStatus(jobId)).toBe("released");
      expect(await at.view(token, jobId)).toMatchObject({
        status: "failed",
        failureCode: "budget_exhausted",
        result: null,
        refund: { kind: "trial", amount: 4 },
      });
      expect(await balance(userId, "trial")).toBe(8);
      expect(await balance(userId, "hold")).toBe(0);
      expect(pushed).toContainEqual({ userId, jobId, status: "failed" });
      expect(await budgetRow(day)).toEqual(before);
    });
  });

  it("상한을 한 장 값만큼만 남기면 첫 작업은 예약하고 청구액으로 정산하며, 같은 날 둘째 작업은 공급사를 부르지 않는다", async () => {
    const day = "2022-02-02";
    const first = apiAt("2022-02-02T01:00:00Z");
    const second = apiAt("2022-02-02T01:01:00Z");
    const { userId, token } = await first.readyUser();
    const firstJob = await first.submit(token);
    const secondJob = await second.submit(token);

    const start = await budgetRow(day);
    await withBudget(day, start.reserved + start.settled + PRICE, async () => {
      const { deps, seen } = countingWorker(second.now);
      expect(await runNextJob(deps)).toEqual({ jobId: firstJob, outcome: "succeeded" });
      expect(seen.calls).toBe(1);
      expect(
        (await attempts(firstJob)).map(({ budget_status, reserved }) => ({
          budget_status,
          reserved,
        })),
      ).toEqual([{ budget_status: "settled", reserved: PRICE }]);
      expect(await budgetRow(day)).toMatchObject({
        reserved: start.reserved,
        settled: start.settled + PRICE,
      });

      expect(await runNextJob(deps)).toEqual({ jobId: secondJob, outcome: "failed" });
      expect(seen.calls).toBe(1);
      expect(await attempts(secondJob)).toEqual([]);
      expect(await jobRow(secondJob)).toEqual({
        status: "failed",
        failure_code: "budget_exhausted",
      });
      expect(await budgetRow(day)).toMatchObject({
        reserved: start.reserved,
        settled: start.settled + PRICE,
      });
    });
    // 첫 작업은 확정, 둘째 작업은 풀기라 무료 장 하나만 쓴다.
    expect(await balance(userId, "trial")).toBe(4);
    expect(await balance(userId, "hold")).toBe(0);
  });

  it("예산을 예약한 뒤 worker 가 내려가고 정산을 두 번 실행해도 예약액과 확정액은 한 번만 반영된다", async () => {
    const day = "2022-02-03";
    const times = ["2022-02-03T01:00:00Z", "2022-02-03T01:01:00Z", "2022-02-03T01:02:00Z"];
    const jobs: { userId: string; jobId: string; token: string; attemptId: string }[] = [];
    for (const time of times) {
      const at = apiAt(time);
      const { userId, token } = await at.readyUser();
      jobs.push({ userId, jobId: await at.submit(token), token: randomUUID(), attemptId: "" });
    }
    const now = new Date(times[2] ?? "");
    const before = await budgetRow(day);

    // worker 가 선점하고 시도 줄을 만들어 예약까지만 한 뒤 내려간 경우다.
    for (const job of jobs) {
      const [claimed] = await api.query<{ job_id: string }>(
        "SELECT job_id FROM nuno_claim_job($1, $2, $3)",
        [job.token, LEASE_SECONDS, now],
      );
      expect(claimed?.job_id).toBe(job.jobId);
      const [attempt] = await api.query<{ id: string | null }>(
        "SELECT nuno_start_attempt($1, $2, $3, 'm', $4) AS id",
        [job.jobId, job.token, SEED_PROVIDER, now],
      );
      expect(attempt?.id).toEqual(expect.any(String));
      job.attemptId = attempt?.id ?? "";
    }
    const [billed, notBilled, unknown] = jobs;
    if (!billed || !notBilled || !unknown) throw new Error("작업 셋을 접수하지 못했다");
    expect(await budgetRow(day)).toEqual({ ...before, reserved: before.reserved + 3 * PRICE });

    // 끝나지 않은 작업의 예약은 정산하지 않는다.
    await settleBudgets({ db: api, now: () => now });
    for (const job of jobs) {
      expect(await attempts(job.jobId)).toEqual([
        { id: job.attemptId, budget_status: "reserved", reserved: PRICE },
      ]);
    }

    // 공급사 사용 기록으로 첫 시도는 청구액 0.03달러, 둘째는 청구 없음을 알았다. 셋째는 모른다.
    await admin.query(
      "UPDATE generation_attempts SET billing_status = 'billed', cost_usd = 0.03 WHERE id = $1",
      [billed.attemptId],
    );
    await admin.query(
      "UPDATE generation_attempts SET billing_status = 'not_billed' WHERE id = $1",
      [notBilled.attemptId],
    );

    const later = new Date(now.getTime() + (LEASE_SECONDS + 1) * 1000);
    const workerDown = { db: api, store, push: countingWorker(later).deps.push, now: () => later };
    await sweepJobs(workerDown);
    for (const job of jobs) {
      expect(await jobRow(job.jobId)).toEqual({ status: "failed", failure_code: "lease_expired" });
      expect(await balance(job.userId, "trial")).toBe(8);
    }

    const settled = {
      budget: before.budget,
      reserved: before.reserved + PRICE,
      settled: before.settled + 300,
    };
    await settleBudgets(workerDown);
    expect(await budgetRow(day)).toEqual(settled);
    const statuses = async () =>
      (await Promise.all(jobs.map((job) => attempts(job.jobId)))).map(([a]) => a?.budget_status);
    expect(await statuses()).toEqual(["settled", "released", "kept_reserved"]);

    await settleBudgets(workerDown);
    expect(await budgetRow(day)).toEqual(settled);
    expect(await statuses()).toEqual(["settled", "released", "kept_reserved"]);

    // 선점이 풀린 뒤 늦게 도착한 시도 마침은 시도 줄도 예산 행도 바꾸지 못한다.
    const [late] = await api.query<{ ok: boolean }>(
      "SELECT nuno_finish_attempt($1, $2, $3, 'completed', 'billed', $4, 100, NULL, $5) AS ok",
      [billed.jobId, billed.token, billed.attemptId, PRICE_USD, later],
    );
    expect(late?.ok).toBe(false);
    expect(await budgetRow(day)).toEqual(settled);
    const [cost] = await admin.query<{ cost: number }>(
      "SELECT (cost_usd * 10000)::int AS cost FROM generation_attempts WHERE id = $1",
      [billed.attemptId],
    );
    expect(cost?.cost).toBe(300);
  });

  it("worker 가 다른 사용자의 시도를 시작하는 동안 정산이 돌아도 교착 없이 둘 다 끝난다", async () => {
    const day = "2022-02-04";
    const times = [
      "2022-02-04T01:00:00Z",
      "2022-02-04T01:00:10Z",
      "2022-02-04T01:00:20Z",
      "2022-02-04T01:00:30Z",
    ];
    const first = apiAt(times[0] ?? "");
    const users = [await first.readyUser(), await first.readyUser()];
    // 사용자마다 끝날 작업 하나와 진행 중일 작업 하나를 접수한다. 끝날 작업을 먼저 접수해 먼저 선점된다.
    const finishing: string[] = [];
    const running: string[] = [];
    for (const [index, user] of users.entries()) {
      finishing.push(await apiAt(times[index] ?? "").submit(user.token));
    }
    for (const [index, user] of users.entries()) {
      running.push(await apiAt(times[index + 2] ?? "").submit(user.token));
    }
    const now = new Date(times[3] ?? "");
    const before = await budgetRow(day);

    const claim = async (jobId: string, at: Date) => {
      const token = randomUUID();
      const [claimed] = await api.query<{ job_id: string }>(
        "SELECT job_id FROM nuno_claim_job($1, $2, $3)",
        [token, LEASE_SECONDS, at],
      );
      expect(claimed?.job_id).toBe(jobId);
      return token;
    };
    const attemptIds: string[] = [];
    for (const jobId of finishing) {
      const token = await claim(jobId, now);
      const [attempt] = await api.query<{ id: string }>(
        "SELECT nuno_start_attempt($1, $2, $3, 'm', $4) AS id",
        [jobId, token, SEED_PROVIDER, now],
      );
      attemptIds.push(attempt?.id ?? "");
    }
    await admin.query(
      "UPDATE generation_attempts SET billing_status = 'billed', cost_usd = $2 WHERE id = ANY($1)",
      [attemptIds, PRICE_USD],
    );
    const later = new Date(now.getTime() + (LEASE_SECONDS + 1) * 1000);
    const workerDown = { db: api, store, push: countingWorker(later).deps.push, now: () => later };
    await sweepJobs(workerDown);
    const runningTokens: string[] = [];
    for (const jobId of running) runningTokens.push(await claim(jobId, later));

    // 정산은 시도를 ID 순서로 고른다. 뒤에 고르는 시도의 주인이 worker 로 새 시도를 시작하는 사용자다.
    const lastIndex = (attemptIds[0] ?? "") < (attemptIds[1] ?? "") ? 1 : 0;
    const lastUser = users[lastIndex]?.userId ?? "";
    const lastRunning = running[lastIndex] ?? "";
    const lastToken = runningTokens[lastIndex] ?? "";

    // nuno_start_attempt 처럼 사용자 행을 먼저 잠그고, 정산이 그 행을 기다리는 동안 예산 행을 잠근다.
    let settling: Promise<number> | undefined;
    const started = await admin.transaction(async (tx) => {
      await tx.query("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", [lastUser]);
      settling = settleBudgets(workerDown);
      await waitForSettleLockWait();
      const [attempt] = await tx.query<{ id: string | null }>(
        "SELECT nuno_start_attempt($1, $2, $3, 'm', $4) AS id",
        [lastRunning, lastToken, SEED_PROVIDER, later],
      );
      return attempt?.id ?? null;
    });
    expect(started).toEqual(expect.any(String));
    expect(await settling).toBeGreaterThanOrEqual(2);

    const rows = await admin.query<{ budget_status: string }>(
      "SELECT budget_status FROM generation_attempts WHERE id = ANY($1) ORDER BY budget_status",
      [[...attemptIds, started]],
    );
    expect(rows.map((row) => row.budget_status)).toEqual(["reserved", "settled", "settled"]);
    expect(await budgetRow(day)).toEqual({
      budget: before.budget,
      reserved: before.reserved + PRICE,
      settled: before.settled + 2 * PRICE,
    });
  });

  it("nuno_api 역할은 예산 표를 읽거나 고치지 못한다", async () => {
    const denied = async (sql: string) => {
      const error = await api.query(sql).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect((error as { code?: string } | null)?.code).toBe("42501");
    };
    await denied("SELECT * FROM cost_daily");
    await denied("UPDATE cost_daily SET budget_usd = 1000");
    await denied("SELECT * FROM cost_budget_defaults");
  });
});

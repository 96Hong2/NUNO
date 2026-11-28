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
import type { ImageCheck, PushMessage } from "./ports.ts";
import type { GenerationProvider } from "./provider.ts";
import { runNextJob, type ClaimedJob, type WorkerDeps } from "./worker.ts";

// 공급사를 부르기 직전의 문지기 시험. 실제 Postgres 에 붙고, 판을 올리거나 줄을 켜는 일은 관리자로 한다.
// worker 는 가장 오래된 접수 작업부터 선점한다. 시험마다 2021년의 서로 다른 한국 날짜로 접수하고 끝까지 돌린다.
// 선점한 작업이 자기 작업인지 먼저 단언한다. 다른 파일이 2020년이나 2030년에 남긴 작업과 섞이지 않는다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const SEED_PROVIDER = `db-test-seed-${randomUUID()}`;
const SEED_MODEL = "seed-model";
let seedId = "";
let resultDir = "";
let store: LocalResultStore;
const pushed: PushMessage[] = [];

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-guards-"));
  store = createLocalResultStore({
    dir: resultDir,
    secret: "db-test",
    publicUrl: "http://api.test",
  });
  await setSwitch(true);
  const [row] = await admin.query<{ id: string }>(
    `INSERT INTO provider_configs
       (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
     VALUES ($1, $2, '1', 'sync', 2, '시험 나라', 1, 0, true) RETURNING id`,
    [SEED_PROVIDER, SEED_MODEL],
  );
  seedId = row?.id ?? "";
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

const setSeedVersion = (version: number) =>
  admin.query("UPDATE provider_configs SET consent_text_version = $2 WHERE id = $1", [
    seedId,
    version,
  ]);

/** 시험이 따로 켜는 공급사 줄. 우선순위 1 이라 켜 두는 동안 지금 고른 줄이 된다. */
async function insertConfig(tag: string): Promise<string> {
  const [row] = await admin.query<{ id: string }>(
    `INSERT INTO provider_configs
       (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
     VALUES ($1, 'm', '1', 'sync', 1, '다른 나라', 1, 0, true) RETURNING id`,
    [`db-test-${tag}-${randomUUID()}`],
  );
  return row?.id ?? "";
}

/** 공급사를 부른 횟수를 세는 가짜 공급사. worker 가 고른 설정 줄도 적어 둔다. */
function countingWorker(at: Date, check: ImageCheck = createFakeImageCheck()) {
  const seen = { calls: 0, configs: [] as ClaimedJob["providerConfig"][] };
  const fake = createFakeProvider("succeed", 0.04);
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
    check,
    push: {
      send: (message) => {
        pushed.push(message);
        return Promise.resolve();
      },
    },
    now: () => at,
    chooseProvider(job) {
      seen.configs.push(job.providerConfig);
      return Promise.resolve({
        provider,
        model: job.providerConfig?.model ?? "none",
        failCheckOnce: false,
      });
    },
  };
  return { deps, seen };
}

interface SignedIn {
  token: string;
  userId: string;
}

const call = (
  app: ReturnType<typeof createApp>,
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

/** 그 시각의 API. 가입과 동의와 접수를 그 시각으로 한다. */
function day(at: string) {
  const now = new Date(at);
  const app = createApp(api, { devRoutes: true, now: () => now, results: store });

  async function readyUser(): Promise<SignedIn> {
    const login = await call(app, "/v1/dev/login", null, {
      method: "POST",
      body: { subject: `db-test-${randomUUID()}` },
    });
    const user = (await login.json()) as SignedIn;
    const consent = await call(app, "/v1/consents", user.token, {
      method: "POST",
      body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
    });
    expect(consent.status).toBe(201);
    return user;
  }

  const postJob = (token: string, consentVersion = CONSENT_TEXT_VERSION) =>
    call(app, "/v1/generation-jobs", token, {
      method: "POST",
      body: {
        requestId: `req-${randomUUID()}`,
        manifest: { twin: { preset: "harin", version: 1 }, items: [randomUUID()] },
        consentVersion,
      },
    });

  async function submit(token: string): Promise<string> {
    const response = await postJob(token);
    expect(response.status).toBe(202);
    return ((await response.json()) as { jobId: string }).jobId;
  }

  async function view(token: string, jobId: string) {
    const response = await call(app, `/v1/generation-jobs/${jobId}`, token);
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  }

  return { now, readyUser, postJob, submit, view };
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

async function attempts(jobId: string) {
  return admin.query<{ round: number; status: string; model: string }>(
    "SELECT round, status, model FROM generation_attempts WHERE job_id = $1 ORDER BY round",
    [jobId],
  );
}

async function jobRow(jobId: string) {
  const [row] = await admin.query<{
    status: string;
    failure_code: string | null;
    provider_config_id: string | null;
    consent_text_version: number | null;
  }>(
    `SELECT status, failure_code, provider_config_id, consent_text_version
     FROM generation_jobs WHERE id = $1`,
    [jobId],
  );
  return row;
}

describe("공급사를 부르기 전 설정 줄과 동의 문구 판 확인", () => {
  it("접수한 작업에 지금 공급사 설정 줄의 ID 와 동의 문구 판이 적히고, 그대로면 그 줄의 모델로 한 번 부르고 succeeded 다", async () => {
    const at = day("2021-01-04T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const jobId = await at.submit(token);
    expect(await jobRow(jobId)).toMatchObject({
      status: "queued",
      provider_config_id: seedId,
      consent_text_version: 1,
    });

    const { deps, seen } = countingWorker(at.now);
    const done = await runNextJob(deps);
    expect(done).toEqual({ jobId, outcome: "succeeded" });
    expect(seen.calls).toBe(1);
    expect(seen.configs).toEqual([{ id: seedId, provider: SEED_PROVIDER, model: SEED_MODEL }]);
    expect(await attempts(jobId)).toEqual([{ round: 1, status: "completed", model: SEED_MODEL }]);
    expect(await balance(userId, "hold")).toBe(0);
  });

  it("작업을 접수한 뒤 동의 문구 판을 올리면 worker 는 공급사를 부르지 않고 실패로 바꾸며 무료 장이 돌아온다", async () => {
    const at = day("2021-01-05T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const jobId = await at.submit(token);
    expect(await balance(userId, "trial")).toBe(4);

    await setSeedVersion(2);
    try {
      const { deps, seen } = countingWorker(at.now);
      const done = await runNextJob(deps);
      expect(done).toEqual({ jobId, outcome: "failed" });
      expect(seen.calls).toBe(0);
      expect(await attempts(jobId)).toEqual([]);
      expect(await jobRow(jobId)).toMatchObject({
        status: "failed",
        failure_code: "consent_outdated",
      });
      expect(await at.view(token, jobId)).toMatchObject({
        status: "failed",
        failureCode: "consent_outdated",
        result: null,
        refund: { kind: "trial", amount: 4 },
      });
      expect(await balance(userId, "trial")).toBe(8);
      expect(await balance(userId, "hold")).toBe(0);
      expect(pushed).toContainEqual({ userId, jobId, status: "failed" });

      // 판이 오른 뒤에는 옛 판 문구로 접수하지 못한다. 라우트는 409, 접수 함수도 같은 코드로 막는다.
      const outdated = await at.postJob(token);
      expect(outdated.status).toBe(409);
      expect(await outdated.json()).toEqual({ error: "consent_text_outdated" });
      const [direct] = await api.query<{ job_id: string | null; error_code: string | null }>(
        "SELECT job_id, error_code FROM nuno_submit_job($1, $2, $3, $4, $5, $6)",
        [userId, `req-${randomUUID()}`, "hash", "{}", CONSENT_TEXT_VERSION, at.now],
      );
      expect(direct).toEqual({ job_id: null, error_code: "consent_text_outdated" });
    } finally {
      await setSeedVersion(1);
    }
  });

  it("켜 둔 공급사 줄이 없으면 접수는 503 provider_unavailable 이고 접수 함수도 작업을 만들지 않는다", async () => {
    const at = day("2021-01-09T01:00:00Z");
    const { userId, token } = await at.readyUser();
    await admin.query("UPDATE provider_configs SET enabled = false WHERE id = $1", [seedId]);
    try {
      const response = await at.postJob(token);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "provider_unavailable" });
      const [direct] = await api.query<{ job_id: string | null; error_code: string | null }>(
        "SELECT job_id, error_code FROM nuno_submit_job($1, $2, $3, $4, $5, $6)",
        [userId, `req-${randomUUID()}`, "hash", "{}", CONSENT_TEXT_VERSION, at.now],
      );
      expect(direct).toEqual({ job_id: null, error_code: "provider_unavailable" });
    } finally {
      await admin.query("UPDATE provider_configs SET enabled = true WHERE id = $1", [seedId]);
    }
    const [jobs] = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM generation_jobs WHERE user_id = $1",
      [userId],
    );
    expect(jobs?.n).toBe(0);
  });

  it("작업을 접수한 뒤 다른 공급사 설정 줄을 켜면 provider_changed 로 실패하고 공급사를 부르지 않는다", async () => {
    const at = day("2021-01-06T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const jobId = await at.submit(token);

    const other = await insertConfig("other");
    try {
      const { deps, seen } = countingWorker(at.now);
      expect(await runNextJob(deps)).toEqual({ jobId, outcome: "failed" });
      expect(seen.calls).toBe(0);
      expect(await attempts(jobId)).toEqual([]);
      expect(await jobRow(jobId)).toMatchObject({
        status: "failed",
        failure_code: "provider_changed",
      });
      expect(await balance(userId, "trial")).toBe(8);
      expect(await balance(userId, "hold")).toBe(0);
    } finally {
      await admin.query("DELETE FROM provider_configs WHERE id = $1", [other]);
    }
  });

  it("작업이 적은 설정 줄을 지우면 작업 행은 남고 ID 가 빈 값이 되며, worker 는 공급사를 부르지 않고 실패로 바꾼다", async () => {
    const at = day("2021-01-07T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const temporary = await insertConfig("removed");
    const jobId = await at
      .submit(token)
      .finally(() => admin.query("DELETE FROM provider_configs WHERE id = $1", [temporary]));
    expect(await jobRow(jobId)).toMatchObject({ status: "queued", provider_config_id: null });

    const { deps, seen } = countingWorker(at.now);
    expect(await runNextJob(deps)).toEqual({ jobId, outcome: "failed" });
    expect(seen.calls).toBe(0);
    expect(seen.configs).toEqual([null]);
    expect(await attempts(jobId)).toEqual([]);
    expect(await jobRow(jobId)).toMatchObject({
      status: "failed",
      failure_code: "provider_changed",
    });
    expect(await balance(userId, "trial")).toBe(8);
  });

  it("검사에서 떨어져 다시 만들기 전에 판이 오르면 둘째 시도 줄을 만들지 않고 공급사를 한 번만 부른 채 실패로 끝낸다", async () => {
    const at = day("2021-01-08T01:00:00Z");
    const { userId, token } = await at.readyUser();
    const jobId = await at.submit(token);

    // 첫 결과를 검사하는 사이에 운영자가 판을 올린 경우다.
    const check: ImageCheck = {
      async check() {
        await setSeedVersion(2);
        return "fail";
      },
    };
    try {
      const { deps, seen } = countingWorker(at.now, check);
      expect(await runNextJob(deps)).toEqual({ jobId, outcome: "failed" });
      expect(seen.calls).toBe(1);
      expect(await attempts(jobId)).toEqual([{ round: 1, status: "completed", model: SEED_MODEL }]);
      expect(await jobRow(jobId)).toMatchObject({
        status: "failed",
        failure_code: "consent_outdated",
      });
      expect(await store.read(`gen30/${userId}/${jobId}-1.jpg`)).toBeNull();
      expect(await balance(userId, "trial")).toBe(8);
      expect(await balance(userId, "hold")).toBe(0);
    } finally {
      await setSeedVersion(1);
    }
  });
});

import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeImageCheck } from "../adapters/fake-image-check.ts";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import { createLocalResultStore, type LocalResultStore } from "../adapters/local-result-store.ts";
import { openPostgres } from "../adapters/postgres.ts";
import { CONSENT_KIND, CONSENT_TEXT_VERSION } from "../account/consent.ts";
import { createApp, MAX_BODY_BYTES } from "../app.ts";
import type { GenerationProvider, GenerationRequest } from "./provider.ts";
import { MAX_UPLOADS_PER_JOB, UPLOAD_MAX_BYTES } from "./upload-check.ts";
import { runNextJob, type WorkerDeps } from "./worker.ts";

// 생성 입력 옷 사진 올리기와 입력 검사 시험. 실제 Postgres 에 붙고, 올리기 줄과 작업 줄은 관리자로 읽는다.
// worker 는 가장 오래된 접수 작업부터 선점한다. worker 를 돌리는 시험은 2027년의 서로 다른 한국 날짜로 접수한다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

/** 1x1 PNG. 머리 바이트와 IEND 끝 조각을 모두 갖춘 그림이다. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const SEED_PROVIDER = `db-test-upload-${randomUUID()}`;
let resultDir = "";
let store: LocalResultStore;

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-upload-"));
  store = createLocalResultStore({ dir: resultDir, secret: "db-test", publicUrl: "http://api.test" });
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

interface SignedIn {
  token: string;
  userId: string;
}

function day(at: string) {
  const now = new Date(at);
  const app = createApp(api, { devRoutes: true, now: () => now, results: store });
  const request = (
    path: string,
    token: string,
    init: { method: string; json?: unknown; bytes?: Uint8Array },
  ) =>
    app.request(path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": init.bytes ? "image/png" : "application/json",
      },
      body: init.bytes ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
    });

  async function readyUser(): Promise<SignedIn> {
    const login = await app.request("/v1/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: `db-test-${randomUUID()}` }),
    });
    const user = (await login.json()) as SignedIn;
    const consent = await request("/v1/consents", user.token, {
      method: "POST",
      json: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
    });
    expect(consent.status).toBe(201);
    return user;
  }

  async function issue(token: string): Promise<string> {
    const response = await request("/v1/uploads", token, { method: "POST" });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { uploadId: string; maxBytes: number };
    expect(body.maxBytes).toBe(UPLOAD_MAX_BYTES);
    return body.uploadId;
  }

  const put = (token: string, uploadId: string, bytes: Uint8Array) =>
    request(`/v1/uploads/${uploadId}`, token, { method: "PUT", bytes });

  async function uploaded(token: string, bytes: Uint8Array = PNG): Promise<string> {
    const uploadId = await issue(token);
    expect((await put(token, uploadId, bytes)).status).toBe(200);
    return uploadId;
  }

  const postJob = (token: string, uploadIds: string[], requestId = `req-${randomUUID()}`) =>
    request("/v1/generation-jobs", token, {
      method: "POST",
      json: {
        requestId,
        manifest: {
          twin: { preset: "harin", version: 1 },
          items: uploadIds.map((uploadId) => ({ id: `g:${uploadId}`, uploadId })),
        },
        consentVersion: CONSENT_TEXT_VERSION,
      },
    });

  return { now, app, readyUser, issue, put, uploaded, postJob };
}

async function uploadRow(id: string) {
  const [row] = await admin.query<{ status: string; r2_key: string | null; byte_size: number }>(
    "SELECT status, r2_key, byte_size FROM uploads WHERE id = $1",
    [id],
  );
  return row;
}

async function jobCount(userId: string): Promise<number> {
  const [row] = await admin.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM generation_jobs WHERE user_id = $1",
    [userId],
  );
  return row?.n ?? -1;
}

async function holdCount(userId: string): Promise<number> {
  const [row] = await admin.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM gold_holds WHERE user_id = $1",
    [userId],
  );
  return row?.n ?? -1;
}

/** 검사에 떨어진 올리기 ID 로 접수하면 422 이고, 작업과 골드 묶음이 생기지 않는다. */
async function expectNotSubmittable(at: ReturnType<typeof day>, user: SignedIn, uploadId: string) {
  const response = await at.postJob(user.token, [uploadId]);
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "invalid_upload" });
  expect(await jobCount(user.userId)).toBe(0);
  expect(await holdCount(user.userId)).toBe(0);
}

async function filesUnder(userId: string): Promise<string[]> {
  const dir = join(resultDir, "job-in", userId);
  return readdir(dir, { recursive: true }).catch(() => []);
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

/** 부른 횟수와 받은 요청을 적는 가짜 공급사 worker. */
function countingWorker(now: Date) {
  const seen = { calls: 0, requests: [] as GenerationRequest[] };
  const fake = createFakeProvider("succeed", 0.04);
  const provider: GenerationProvider = {
    name: fake.name,
    generate(request, signal) {
      seen.calls += 1;
      seen.requests.push(request);
      return fake.generate(request, signal);
    },
  };
  const deps: WorkerDeps = {
    db: api,
    store,
    check: createFakeImageCheck(),
    push: { send: () => Promise.resolve() },
    now: () => now,
    chooseProvider: () => Promise.resolve({ provider, model: "m", failCheckOnce: false }),
  };
  return { deps, seen };
}

describe("올리기 ID 소유 확인", () => {
  it("다른 계정이 올린 ID 로 생성을 요청하면 422 이고 작업이 생기지 않는다. 올린 계정은 같은 ID 로 접수된다", async () => {
    const at = day("2027-06-01T01:00:00Z");
    const owner = await at.readyUser();
    const other = await at.readyUser();
    const uploadId = await at.uploaded(owner.token);

    const rejected = await at.postJob(other.token, [uploadId]);
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toEqual({ error: "invalid_upload" });
    expect(await jobCount(other.userId)).toBe(0);

    // 확정 전 ID 와 없는 ID 도 같은 답이다. 남의 ID 인지 알 수 없다.
    const issuedOnly = await at.issue(other.token);
    expect((await at.postJob(other.token, [issuedOnly])).status).toBe(422);
    expect((await at.postJob(other.token, [randomUUID()])).status).toBe(422);
    expect(await jobCount(other.userId)).toBe(0);

    expect((await at.postJob(owner.token, [uploadId])).status).toBe(202);
  });

  it("다른 계정의 올리기 ID 에 그림을 올리면 404 이고 그 줄과 파일은 바뀌지 않는다", async () => {
    const at = day("2027-06-01T02:00:00Z");
    const owner = await at.readyUser();
    const other = await at.readyUser();
    const uploadId = await at.issue(owner.token);

    const response = await at.put(other.token, uploadId, PNG);
    expect(response.status).toBe(404);
    expect(await uploadRow(uploadId)).toMatchObject({ status: "issued", r2_key: null });
    expect(await filesUnder(other.userId)).toEqual([]);
  });
});

describe("크기와 형식 검사", () => {
  it("크기 상한을 1바이트 넘긴 파일은 413 이고 파일과 확정 줄이 생기지 않는다", async () => {
    const at = day("2027-06-02T01:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.issue(user.token);
    const big = new Uint8Array(UPLOAD_MAX_BYTES + 1);
    big.set(PNG.subarray(0, 8));

    const response = await at.put(user.token, uploadId, big);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "upload_too_large" });
    expect(await uploadRow(uploadId)).toMatchObject({ status: "issued", r2_key: null });
    expect(await filesUnder(user.userId)).toEqual([]);
    await expectNotSubmittable(at, user, uploadId);
  });

  it("글자 파일과 끝이 잘린 PNG 는 415 이고 확정되지 않는다", async () => {
    const at = day("2027-06-02T02:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.issue(user.token);

    for (const bytes of [Buffer.from("이것은 그림이 아니다"), PNG.subarray(0, PNG.length - 4)]) {
      const response = await at.put(user.token, uploadId, bytes);
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "unsupported_format" });
    }
    expect(await uploadRow(uploadId)).toMatchObject({ status: "issued", r2_key: null });
    await expectNotSubmittable(at, user, uploadId);
  });

  it("꼴이 틀린 올리기 ID 로 접수하면 422 이고, 확정 뒤 23시간이 지난 ID 도 422 다", async () => {
    const at = day("2027-06-03T01:00:00Z");
    const user = await at.readyUser();
    await expectNotSubmittable(at, user, "not-a-uuid");
    const uploadId = await at.uploaded(user.token);
    expect(await uploadRow(uploadId)).toMatchObject({ status: "confirmed" });

    const later = day("2027-06-04T00:00:01Z");
    await expectNotSubmittable(later, user, uploadId);
  });

  it("확정 뒤 23시간에서 대기 상한 5분이 남지 않은 ID 는 접수 때 422 다", async () => {
    const at = day("2027-06-03T02:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.uploaded(user.token);
    expect(await uploadRow(uploadId)).toMatchObject({ status: "confirmed" });

    // 22시간 56분 뒤: 접수 시각으로는 기한 안이지만 worker 가 5분 뒤 선점하면 기한 밖이다
    await expectNotSubmittable(day("2027-06-04T00:56:00Z"), user, uploadId);
    // 22시간 54분 뒤에는 접수된다
    expect((await day("2027-06-04T00:54:00Z").postJob(user.token, [uploadId])).status).toBe(202);
  });

  it("올리기 주소가 아닌 주소는 앱 전체 본문 상한이 그대로다", async () => {
    const at = day("2027-06-02T03:00:00Z");
    const user = await at.readyUser();
    const response = await at.app.request("/v1/generation-jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES + 1) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body_too_large" });
  });
});

describe("다시 보내기와 상한", () => {
  it("대문자로 쓴 올리기 ID 로 올려도 확정되고, 파일 키는 소문자 ID 아래다", async () => {
    const at = day("2027-06-05T01:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.issue(user.token);

    expect((await at.put(user.token, uploadId.toUpperCase(), PNG)).status).toBe(200);
    const row = await uploadRow(uploadId);
    expect(row?.status).toBe("confirmed");
    expect(row?.r2_key?.startsWith(`job-in/${user.userId}/${uploadId}/`)).toBe(true);
    // 올리기 ID 폴더 하나와 파일 하나
    expect(await filesUnder(user.userId)).toHaveLength(2);
  });

  it("확정한 ID 로 같은 바이트를 다시 올리면 200, 다른 바이트면 409 이고 파일은 하나다", async () => {
    const at = day("2027-06-05T02:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.uploaded(user.token);
    const before = await uploadRow(uploadId);
    const written = (await stat(join(resultDir, before?.r2_key ?? "missing"))).mtimeMs;

    const again = await at.put(user.token, uploadId, PNG);
    expect(again.status).toBe(200);
    // 확정된 파일은 다시 쓰지 않는다
    expect((await stat(join(resultDir, before?.r2_key ?? "missing"))).mtimeMs).toBe(written);
    expect(((await again.json()) as { uploadId: string }).uploadId).toBe(uploadId);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
    const other = await at.put(user.token, uploadId, jpeg);
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: "upload_already_confirmed" });
    expect(await uploadRow(uploadId)).toEqual(before);
    // 올리기 ID 폴더 하나와 파일 하나
    expect(await filesUnder(user.userId)).toHaveLength(2);
  });

  it("올린 옷 사진이 상한보다 많은 입력 목록은 422 다", async () => {
    const at = day("2027-06-05T03:00:00Z");
    const user = await at.readyUser();
    const ids: string[] = [];
    for (let i = 0; i <= MAX_UPLOADS_PER_JOB; i += 1) ids.push(await at.uploaded(user.token));

    const response = await at.postJob(user.token, ids);
    expect(response.status).toBe(422);
    expect(await jobCount(user.userId)).toBe(0);
  });

  it("같은 요청 ID 로 다시 보내면 올리기가 기한을 넘겼어도 앞서 접수한 작업을 준다", async () => {
    const at = day("2027-06-06T01:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.uploaded(user.token);
    const requestId = `req-${randomUUID()}`;
    const first = await at.postJob(user.token, [uploadId], requestId);
    expect(first.status).toBe(202);
    const { jobId } = (await first.json()) as { jobId: string };

    const later = day("2027-06-07T02:00:00Z");
    const again = await later.postJob(user.token, [uploadId], requestId);
    expect(again.status).toBe(202);
    expect(((await again.json()) as { jobId: string }).jobId).toBe(jobId);
    expect(await jobCount(user.userId)).toBe(1);
  });
});

describe("worker 입력 검사", () => {
  it("확정한 그림은 그 바이트 그대로 공급사 입력으로 간다", async () => {
    const at = day("2027-07-01T01:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.uploaded(user.token);
    const response = await at.postJob(user.token, [uploadId]);
    const { jobId } = (await response.json()) as { jobId: string };

    const { deps, seen } = countingWorker(at.now);
    expect(await runNextJob(deps)).toEqual({ jobId, outcome: "succeeded" });
    expect(seen.calls).toBe(1);
    expect(seen.requests[0]?.garmentImages.map((image) => Buffer.from(image))).toEqual([PNG]);
  });

  it("확정 뒤 파일이 바뀌면 공급사를 부르지 않고 input_invalid 로 끝나며 무료 장이 돌아온다", async () => {
    const at = day("2027-07-02T01:00:00Z");
    const user = await at.readyUser();
    const uploadId = await at.uploaded(user.token);
    const response = await at.postJob(user.token, [uploadId]);
    const { jobId } = (await response.json()) as { jobId: string };
    const trialAfterSubmit = await balance(user.userId, "trial");

    const row = await uploadRow(uploadId);
    await writeFile(join(resultDir, row?.r2_key ?? "missing"), Buffer.from("바꿔치기한 파일"));

    const { deps, seen } = countingWorker(at.now);
    expect(await runNextJob(deps)).toEqual({ jobId, outcome: "failed" });
    expect(seen.calls).toBe(0);
    const [job] = await admin.query<{ failure_code: string; attempts: number }>(
      `SELECT j.failure_code, (SELECT count(*)::int FROM generation_attempts a WHERE a.job_id = j.id) AS attempts
       FROM generation_jobs j WHERE j.id = $1`,
      [jobId],
    );
    expect(job).toEqual({ failure_code: "input_invalid", attempts: 0 });
    expect(await balance(user.userId, "trial")).toBe(trialAfterSubmit + 4);
    expect(await balance(user.userId, "hold")).toBe(0);
  });
});

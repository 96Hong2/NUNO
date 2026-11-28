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
import { expireQueuedJobs, runNextJob, type WorkerDeps } from "../generation/worker.ts";
import { keptResultKey } from "./keep-result.ts";

// 「내 룩북에 저장」 이 결과 파일을 저장 자리로 복사한 직후 서버가 내려간 경우의 시험. 실제 Postgres 에 붙는다.
// 그때 파일은 gen30 과 저장 자리 두 곳에 있고 DB 는 아직 gen30 이다. 다시 저장하면 룩 하나와 열리는 사진이 남아야 한다.
// worker 는 가장 오래된 접수 작업부터 선점한다. 2024년 한국 날짜로 접수하고 선점 전에 그 시각으로 대기 만료를 부른다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const SEED_PROVIDER = `db-test-keep-${randomUUID()}`;
const SECRET = "db-test";
let resultDir = "";
let store: LocalResultStore;

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-keep-"));
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

describe("저장 자리로 복사한 직후 서버가 내려간 뒤 다시 저장", () => {
  it("룩북에 룩이 1개 생기고, 그 룩의 사진이 열리며, gen30 파일은 지워진다", async () => {
    const now = new Date("2024-02-01T01:00:00Z");
    const app = createApp(api, {
      devRoutes: true,
      now: () => now,
      results: store,
      files: { secret: SECRET, read: (key) => store.read(key) },
    });
    const call = (path: string, token: string | null, body?: unknown) =>
      app.request(path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const open = (url: string) => {
      const parsed = new URL(url);
      return call(`${parsed.pathname}${parsed.search}`, null);
    };

    const login = await call("/v1/dev/login", null, { subject: `db-test-${randomUUID()}` });
    const { token, userId } = (await login.json()) as { token: string; userId: string };
    expect(
      (await call("/v1/consents", token, { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION }))
        .status,
    ).toBe(201);
    const submitted = await call("/v1/generation-jobs", token, {
      requestId: `req-${randomUUID()}`,
      manifest: { twin: { preset: "harin", version: 1 }, items: [randomUUID()] },
      consentVersion: CONSENT_TEXT_VERSION,
    });
    expect(submitted.status).toBe(202);
    const { jobId } = (await submitted.json()) as { jobId: string };

    const deps: WorkerDeps = {
      db: api,
      store,
      check: createFakeImageCheck(),
      push: { send: () => Promise.resolve() },
      now: () => now,
      chooseProvider: () =>
        Promise.resolve({
          provider: createFakeProvider("succeed", 0.04),
          model: "m",
          failCheckOnce: false,
        }),
    };
    await expireQueuedJobs(deps);
    expect(await runNextJob(deps)).toEqual({ jobId, outcome: "succeeded" });

    const [result] = await admin.query<{ id: string; r2_key: string; storage_state: string }>(
      "SELECT id, r2_key, storage_state FROM generation_results WHERE job_id = $1",
      [jobId],
    );
    if (!result) throw new Error("결과 행이 없다");
    const original = await store.read(result.r2_key);
    expect(original).not.toBeNull();

    // 저장 함수가 파일을 복사한 직후 내려간 상태를 만든다. DB 는 아직 gen30 이다.
    const keptKey = keptResultKey(userId, result.id);
    await store.copy(result.r2_key, keptKey);
    expect(result.storage_state).toBe("gen30");
    expect(await store.read(keptKey)).toEqual(original);

    const again = await call(`/v1/generation-jobs/${jobId}/keep`, token, { wornItems: [] });
    expect(again.status).toBe(200);
    const { lookId } = (await again.json()) as { lookId: string };

    const [row] = await admin.query<{ r2_key: string; storage_state: string }>(
      "SELECT r2_key, storage_state FROM generation_results WHERE id = $1",
      [result.id],
    );
    expect(row).toEqual({ r2_key: keptKey, storage_state: "kept" });
    expect(await store.read(result.r2_key)).toBeNull();
    expect(await store.read(keptKey)).toEqual(original);

    const looks = await call("/v1/looks", token);
    expect(looks.status).toBe(200);
    const { looks: list } = (await looks.json()) as {
      looks: { lookId: string; resultId: string; imageUrl: string }[];
    };
    expect(list.map(({ lookId: id, resultId }) => ({ id, resultId }))).toEqual([
      { id: lookId, resultId: result.id },
    ]);
    const photo = await open(list[0]?.imageUrl ?? "");
    expect(photo.status).toBe(200);
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(original);

    // 한 번 더 눌러도 같은 룩이다.
    const third = await call(`/v1/generation-jobs/${jobId}/keep`, token, { wornItems: [] });
    expect(await third.json()).toEqual({ lookId });
    const [count] = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM looks WHERE user_id = $1",
      [userId],
    );
    expect(count?.n).toBe(1);
  });
});

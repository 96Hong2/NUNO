import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp } from "../app.ts";
import { CONSENT_KIND } from "./consent.ts";

// 설정 「사진 보관 안내」 와 동의 화면이 읽는 서버 값 시험. 실제 Postgres 에 붙고, 공급사 줄은 관리자로 바꾼다.
// 보관 기간과 동의 문구 판은 공급사 설정 줄에 있고, 앱은 서버가 준 값을 보인다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const SEED_PROVIDER = `db-test-seed-${randomUUID()}`;
const NOW = new Date("2030-05-01T03:00:00Z");
const app = createApp(api, { devRoutes: true, now: () => NOW });

beforeAll(async () => {
  await admin.query(
    `INSERT INTO provider_configs
       (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
     VALUES ($1, 'm', '1', 'sync', 2, '시험 나라', 1, 0, true)`,
    [SEED_PROVIDER],
  );
});

afterAll(async () => {
  await admin.query("DELETE FROM provider_configs WHERE provider = $1", [SEED_PROVIDER]);
  await api.close();
  await admin.close();
});

const call = (path: string, token: string | null, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function devLogin(): Promise<string> {
  const response = await call("/v1/dev/login", null, {
    method: "POST",
    body: { subject: `db-test-${randomUUID()}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { token: string }).token;
}

const setSeed = (retentionDays: number, version: number) =>
  admin.query(
    "UPDATE provider_configs SET retention_days = $2, consent_text_version = $3 WHERE provider = $1",
    [SEED_PROVIDER, retentionDays, version],
  );

describe("AI 업체 서버의 사진 보관 기간", () => {
  it("보관 기간은 지금 공급사 설정 줄의 값이다. 새 줄은 30일이고, 7일로 바꾸면 응답도 7일이다", async () => {
    const token = await devLogin();
    const first = await call("/v1/consents/generation-transfer/retention", token);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ retentionDays: 30 });

    await setSeed(7, 2);
    try {
      const changed = await call("/v1/consents/generation-transfer/retention", token);
      expect(await changed.json()).toEqual({ retentionDays: 7 });
      // 보관 기간과 함께 올린 판이 동의 화면과 내 정보의 지금 판이다.
      expect(await (await call("/v1/consents/generation-transfer", token)).json()).toMatchObject({
        currentVersion: 2,
        provider: SEED_PROVIDER,
      });
      expect(await (await call("/v1/me", token)).json()).toMatchObject({
        consent: { agreed: false, textVersion: null, currentVersion: 2 },
      });
      const oldText = await call("/v1/consents", token, {
        method: "POST",
        body: { kind: CONSENT_KIND, textVersion: 1 },
      });
      expect(oldText.status).toBe(409);
      expect(await oldText.json()).toEqual({ error: "consent_text_outdated" });
      const newText = await call("/v1/consents", token, {
        method: "POST",
        body: { kind: CONSENT_KIND, textVersion: 2 },
      });
      expect(newText.status).toBe(201);
      expect(await (await call("/v1/me", token)).json()).toMatchObject({
        consent: { agreed: true, textVersion: 2, currentVersion: 2 },
      });
    } finally {
      await setSeed(30, 1);
    }
  });

  it("켜 둔 공급사가 없으면 보관 기간은 null 이고 지금 판도 null 이다", async () => {
    const token = await devLogin();
    await admin.query("UPDATE provider_configs SET enabled = false WHERE provider = $1", [
      SEED_PROVIDER,
    ]);
    try {
      expect(
        await (await call("/v1/consents/generation-transfer/retention", token)).json(),
      ).toEqual({ retentionDays: null });
      expect(await (await call("/v1/consents/generation-transfer", token)).json()).toEqual({
        currentVersion: null,
        provider: null,
        country: null,
      });
    } finally {
      await admin.query("UPDATE provider_configs SET enabled = true WHERE provider = $1", [
        SEED_PROVIDER,
      ]);
    }
  });

  it("보관 기간이 음수이거나 판이 0 이면 설정 줄에 넣지 못한다", async () => {
    for (const [days, version] of [
      [-1, 1],
      [30, 0],
    ] as const) {
      const error = await setSeed(days, version).catch((caught: unknown) => caught);
      expect((error as { code?: string }).code).toBe("23514");
    }
  });
});

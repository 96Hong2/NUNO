import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp, MAX_BODY_BYTES } from "../app.ts";
import { CONSENT_KIND, CONSENT_TEXT_VERSION } from "./consent.ts";
import { SESSION_DAYS } from "./session.ts";

// 실제 Postgres 에 붙는 시험. scripts/test-db.mjs 가 판을 적용한 뒤 두 주소를 넘긴다.
// API 는 nuno_api 로 붙고, 행 수 확인과 공급사 줄 준비는 관리자로 한다.
// test-b(덤프 복원본)에서 한 번 더 돌므로 subject 는 매번 새로 만든다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);
// 동의는 켜 둔 공급사가 있어야 받는다. 이 파일 동안만 켜 둔 공급사 한 줄을 둔다.
const SEED_PROVIDER = `db-test-seed-${randomUUID()}`;
const setSeedEnabled = (enabled: boolean) =>
  admin.query("UPDATE provider_configs SET enabled = $2 WHERE provider = $1", [
    SEED_PROVIDER,
    enabled,
  ]);
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

const NOW = new Date("2030-03-01T09:00:00Z");
const app = createApp(api, { devRoutes: true, now: () => NOW });

interface SignedIn {
  token: string;
  userId: string;
  created: boolean;
}

const pgError = (error: unknown) => (error as { code?: string }).code;
const newSubject = () => `db-test-${randomUUID()}`;

async function devLogin(subject: string, target = app): Promise<SignedIn> {
  const response = await target.request("/v1/dev/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as SignedIn;
}

const call = (path: string, token: string | null, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function userCount(): Promise<number> {
  const [row] = await admin.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return row?.n ?? -1;
}

async function usersForSubject(subject: string): Promise<string[]> {
  const rows = await admin.query<{ user_id: string }>(
    "SELECT user_id FROM auth_identities WHERE provider = 'dev' AND subject = $1",
    [subject],
  );
  return rows.map((row) => row.user_id);
}

describe("가입과 로그인", () => {
  it("같은 subject 로 두 번 로그인하면 users 는 한 행이다. 로그아웃 뒤 다시 와도 같다", async () => {
    const before = await userCount();
    const subject = newSubject();
    const first = await devLogin(subject);
    expect(first.created).toBe(true);
    const second = await devLogin(subject);
    expect(second).toMatchObject({ userId: first.userId, created: false });

    expect((await call("/v1/auth/sign-out", second.token, { method: "POST" })).status).toBe(204);
    const third = await devLogin(subject);
    expect(third).toMatchObject({ userId: first.userId, created: false });

    expect(await userCount()).toBe(before + 1);
    expect(await usersForSubject(subject)).toEqual([first.userId]);
  });

  it("같은 subject 로 동시에 다섯 번 로그인해도 사용자는 하나다", async () => {
    const before = await userCount();
    const subject = newSubject();
    const results = await Promise.all(Array.from({ length: 5 }, () => devLogin(subject)));
    expect(new Set(results.map((result) => result.userId)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await userCount()).toBe(before + 1);
  });

  it("세션 토큰으로 내 정보를 읽고, 없거나 틀리거나 로그아웃한 토큰은 401 이다", async () => {
    const signedIn = await devLogin(newSubject());
    const me = await call("/v1/me", signedIn.token);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      user: { id: signedIn.userId },
      consent: { agreed: false, textVersion: null, currentVersion: CONSENT_TEXT_VERSION },
    });

    expect((await call("/v1/me", null)).status).toBe(401);
    expect((await call("/v1/me", `${signedIn.token.slice(0, -2)}xx`)).status).toBe(401);

    expect((await call("/v1/auth/sign-out", signedIn.token, { method: "POST" })).status).toBe(204);
    expect((await call("/v1/me", signedIn.token)).status).toBe(401);
  });

  it(`세션은 ${SESSION_DAYS}일 뒤에 만료된다`, async () => {
    const signedIn = await devLogin(newSubject());
    const dayMs = 24 * 60 * 60 * 1000;
    const at = (days: number) => {
      const later = new Date(NOW.getTime() + days * dayMs);
      return createApp(api, { now: () => later }).request("/v1/me", {
        headers: { Authorization: `Bearer ${signedIn.token}` },
      });
    };
    expect((await at(SESSION_DAYS - 1)).status).toBe(200);
    expect((await at(SESSION_DAYS)).status).toBe(401);
  });

  it("정지된 계정의 세션은 401 이다", async () => {
    const signedIn = await devLogin(newSubject());
    await admin.query("UPDATE users SET status = 'suspended' WHERE id = $1", [signedIn.userId]);
    expect((await call("/v1/me", signedIn.token)).status).toBe(401);
  });

  it("개발 주소를 켜지 않은 앱에는 POST /v1/dev/login 이 없다(404)", async () => {
    const production = createApp(api);
    const response = await production.request("/v1/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: newSubject() }),
    });
    expect(response.status).toBe(404);
  });

  it("Apple 설정이 없으면 Apple 로그인은 503 apple_not_configured 다", async () => {
    const response = await call("/v1/auth/apple", null, {
      method: "POST",
      body: { identityToken: "a.b.c", authorizationCode: "code", nonce: "nonce" },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "apple_not_configured" });
  });

  it("상한을 넘는 본문은 로그인 없는 주소에서도 413 body_too_large 이고 사용자가 생기지 않는다", async () => {
    const before = await userCount();
    const response = await app.request("/v1/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: newSubject(), pad: "x".repeat(MAX_BODY_BYTES) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body_too_large" });
    expect(await userCount()).toBe(before);
  });
});

describe("완성 룩 만들기 동의", () => {
  it("동의하면 consents 에 판 번호와 동의 시각이 든 행이 하나 생기고 내 정보가 동의함이 된다", async () => {
    const { token, userId } = await devLogin(newSubject());
    const response = await call("/v1/consents", token, {
      method: "POST",
      body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
    });
    expect(response.status).toBe(201);

    const rows = await admin.query<{ text_version: number; agreed_at: Date; withdrawn_at: null }>(
      "SELECT text_version, agreed_at, withdrawn_at FROM consents WHERE user_id = $1",
      [userId],
    );
    expect(rows).toEqual([
      { text_version: CONSENT_TEXT_VERSION, agreed_at: NOW, withdrawn_at: null },
    ]);
    expect(await (await call("/v1/me", token)).json()).toMatchObject({
      consent: { agreed: true, textVersion: CONSENT_TEXT_VERSION },
    });
  });

  it("앱이 보낸 문구 판이 서버 판과 다르면 409 consent_text_outdated 이고 행이 생기지 않는다", async () => {
    const { token, userId } = await devLogin(newSubject());
    const response = await call("/v1/consents", token, {
      method: "POST",
      body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION + 1 },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "consent_text_outdated" });
    const rows = await admin.query("SELECT id FROM consents WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(0);
  });

  it("철회하면 내 정보가 동의 안 함이 되고, 다시 동의하면 옛 행은 그대로 두고 새 행을 더한다", async () => {
    const { token, userId } = await devLogin(newSubject());
    const agree = { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION };
    await call("/v1/consents", token, { method: "POST", body: agree });

    const withdraw = await call("/v1/consents/withdraw", token, {
      method: "POST",
      body: { kind: CONSENT_KIND },
    });
    expect(await withdraw.json()).toEqual({ withdrawn: 1 });
    expect(await (await call("/v1/me", token)).json()).toMatchObject({
      consent: { agreed: false, textVersion: null },
    });

    await call("/v1/consents", token, { method: "POST", body: agree });
    const rows = await admin.query<{ withdrawn_at: Date | null }>(
      "SELECT withdrawn_at FROM consents WHERE user_id = $1 ORDER BY withdrawn_at NULLS LAST",
      [userId],
    );
    expect(rows).toEqual([{ withdrawn_at: NOW }, { withdrawn_at: null }]);
    expect(await (await call("/v1/me", token)).json()).toMatchObject({ consent: { agreed: true } });
  });

  it("켜 둔 공급사가 없으면 409 provider_unavailable 이고 동의 행이 생기지 않는다", async () => {
    const { token, userId } = await devLogin(newSubject());
    await setSeedEnabled(false);
    try {
      const response = await call("/v1/consents", token, {
        method: "POST",
        body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "provider_unavailable" });
    } finally {
      await setSeedEnabled(true);
    }
    const rows = await admin.query("SELECT id FROM consents WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(0);
  });

  it("동의 화면의 받는 곳은 켜 둔 공급사 가운데 우선순위가 가장 앞선 줄이다", async () => {
    const tag = randomUUID();
    const insert = (priority: number, country: string, enabled: boolean) =>
      admin.query(
        `INSERT INTO provider_configs
           (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
         VALUES ($1, 'm', '1', 'sync', $2, $3, 1, 0, $4)`,
        [`db-test-${tag}-${priority}`, priority, country, enabled],
      );
    const { token } = await devLogin(newSubject());
    await setSeedEnabled(false);
    try {
      await insert(1, "꺼진 나라", false);
      await insert(2, "켜진 나라", true);
      const response = await call("/v1/consents/generation-transfer", token);
      expect(await response.json()).toEqual({
        currentVersion: CONSENT_TEXT_VERSION,
        provider: `db-test-${tag}-2`,
        country: "켜진 나라",
      });
    } finally {
      await admin.query("DELETE FROM provider_configs WHERE provider LIKE $1", [
        `db-test-${tag}-%`,
      ]);
      await setSeedEnabled(true);
    }
  });
});

describe("푸시 기기", () => {
  it("같은 푸시 토큰을 다른 계정이 등록하면 기기 행은 하나이고 주인이 바뀐다", async () => {
    const pushToken = `ExponentPushToken[${randomUUID()}]`;
    const a = await devLogin(newSubject());
    const b = await devLogin(newSubject());
    const register = (token: string) =>
      call("/v1/devices", token, { method: "POST", body: { pushToken, platform: "ios" } });
    expect((await register(a.token)).status).toBe(201);
    expect((await register(b.token)).status).toBe(201);
    const rows = await admin.query<{ user_id: string }>(
      "SELECT user_id FROM devices WHERE push_token = $1",
      [pushToken],
    );
    expect(rows).toEqual([{ user_id: b.userId }]);
  });
});

describe("nuno_api 권한", () => {
  it("users 와 consents 에 직접 INSERT 하면 권한 오류(42501)가 난다", async () => {
    const { userId } = await devLogin(newSubject());
    const insertUser = await api
      .query("INSERT INTO users (created_at) VALUES ($1)", [NOW])
      .catch((caught: unknown) => caught);
    expect(pgError(insertUser)).toBe("42501");
    const insertConsent = await api
      .query(
        "INSERT INTO consents (user_id, kind, text_version, agreed_at) VALUES ($1, $2, $3, $4)",
        [userId, CONSENT_KIND, CONSENT_TEXT_VERSION, NOW],
      )
      .catch((caught: unknown) => caught);
    expect(pgError(insertConsent)).toBe("42501");
  });

  it("세션 표와 Apple 자격 표는 읽지도 못한다", async () => {
    for (const table of ["auth_sessions", "apple_credentials", "auth_identities", "users"]) {
      const error = await api
        .query(`SELECT * FROM ${table} LIMIT 1`)
        .catch((caught: unknown) => caught);
      expect({ table, code: pgError(error) }).toEqual({ table, code: "42501" });
    }
  });
});

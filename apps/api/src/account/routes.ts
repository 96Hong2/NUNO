import { Hono, type Context } from "hono";
import type { SqlClient } from "../db/sql-client.ts";
import type { AppleAuth } from "./apple.ts";
import { CONSENT_KIND, CONSENT_TEXT_VERSION, consentProvider, consentState } from "./consent.ts";
import { requireUser, type AuthEnv } from "./require-user.ts";
import { signIn } from "./session.ts";

export interface AccountDeps {
  db: SqlClient;
  now: () => Date;
  /** 없으면 Apple 설정 환경 변수가 빠진 것이다. */
  apple: AppleAuth | null;
}

const PLATFORMS = new Set(["ios", "android"]);

/** 본문이 JSON 객체가 아니면 null. */
async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

const badRequest = (c: Context, error: string) => c.json({ error }, 400);

/** 로그인, 로그아웃, 내 정보, 동의, 푸시 기기 주소. */
export function accountRoutes({ db, now, apple }: AccountDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const auth = requireUser(db, now);

  routes.post("/v1/auth/apple", async (c) => {
    if (!apple) return c.json({ error: "apple_not_configured" }, 503);
    const body = await readJsonObject(c);
    const identityToken = text(body?.identityToken, 8192);
    const authorizationCode = text(body?.authorizationCode, 1024);
    const nonce = text(body?.nonce, 256);
    if (!identityToken || !authorizationCode || !nonce) return badRequest(c, "invalid_body");

    const checked = await apple.verifyIdentityToken(identityToken, nonce, now());
    if (!checked.ok) return c.json({ error: "invalid_identity_token" }, 401);
    // 인가 코드를 먼저 바꾼다. 실패하면 사용자를 만들지 않는다.
    const encrypted = await apple
      .exchangeAuthorizationCode(authorizationCode, now())
      .catch((error: unknown) => {
        console.error("Apple 인가 코드 교환 실패", error);
        return null;
      });
    if (!encrypted) return c.json({ error: "apple_exchange_failed" }, 502);

    const signedIn = await signIn(db, "apple", checked.subject, now());
    await db.query("SELECT nuno_store_apple_credential($1, $2, $3)", [
      signedIn.userId,
      encrypted,
      now(),
    ]);
    return c.json(signedIn);
  });

  routes.post("/v1/auth/sign-out", auth, async (c) => {
    await db.query("SELECT nuno_sign_out($1, $2)", [c.get("tokenHash"), now()]);
    return c.body(null, 204);
  });

  routes.get("/v1/me", auth, async (c) => {
    const userId = c.get("userId");
    return c.json({ user: { id: userId }, consent: await consentState(db, userId) });
  });

  routes.get("/v1/consents/generation-transfer", auth, async (c) =>
    c.json(await consentProvider(db)),
  );

  routes.post("/v1/consents", auth, async (c) => {
    const body = await readJsonObject(c);
    if (body?.kind !== CONSENT_KIND) return badRequest(c, "unknown_consent_kind");
    if (!Number.isInteger(body.textVersion)) return badRequest(c, "invalid_body");
    if (body.textVersion !== CONSENT_TEXT_VERSION) {
      return c.json({ error: "consent_text_outdated" }, 409);
    }
    // 받는 곳을 화면에 적지 못했으면 동의를 받지 않는다.
    if ((await consentProvider(db)).provider === null) {
      return c.json({ error: "provider_unavailable" }, 409);
    }
    const [row] = await db.query<{ id: string }>(
      "SELECT nuno_agree_consent($1, $2, $3, $4) AS id",
      [c.get("userId"), CONSENT_KIND, CONSENT_TEXT_VERSION, now()],
    );
    return c.json({ consentId: row?.id }, 201);
  });

  routes.post("/v1/consents/withdraw", auth, async (c) => {
    const body = await readJsonObject(c);
    if (body?.kind !== CONSENT_KIND) return badRequest(c, "unknown_consent_kind");
    const [row] = await db.query<{ count: number }>(
      "SELECT nuno_withdraw_consent($1, $2, $3) AS count",
      [c.get("userId"), CONSENT_KIND, now()],
    );
    return c.json({ withdrawn: row?.count ?? 0 });
  });

  routes.post("/v1/devices", auth, async (c) => {
    const body = await readJsonObject(c);
    const pushToken = text(body?.pushToken, 512);
    const platform = text(body?.platform, 16);
    if (!pushToken || !platform || !PLATFORMS.has(platform)) return badRequest(c, "invalid_body");
    const [row] = await db.query<{ id: string }>(
      "SELECT nuno_register_device($1, $2, $3, $4) AS id",
      [c.get("userId"), pushToken, platform, now()],
    );
    return c.json({ deviceId: row?.id }, 201);
  });

  return routes;
}

/** 개발 전용 로그인. NUNO_DEV_ROUTES=1 일 때만 `/v1/dev` 아래에 단다. */
export function devAccountRoutes({ db, now }: Pick<AccountDeps, "db" | "now">): Hono {
  const routes = new Hono();
  routes.post("/login", async (c) => {
    const subject = text((await readJsonObject(c))?.subject, 200);
    if (!subject) return badRequest(c, "invalid_body");
    return c.json(await signIn(db, "dev", subject, now()));
  });
  return routes;
}

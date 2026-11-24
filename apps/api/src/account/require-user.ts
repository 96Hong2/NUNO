import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { SqlClient } from "../db/sql-client.ts";
import { hashSessionToken, sessionUser } from "./session.ts";

/** 인증을 거친 요청이 갖는 값. 사용자 ID 는 이 값으로만 얻고 요청 본문에서 받지 않는다. */
export interface AuthEnv {
  Variables: { userId: string; tokenHash: Buffer };
}

const BEARER = /^Bearer ([A-Za-z0-9_-]{16,128})$/;

const unauthorized = (c: Context) => c.json({ error: "unauthorized" }, 401);

/** `Authorization: Bearer <세션 토큰>` 을 확인해 사용자 ID 를 붙인다. 없거나 틀리면 401. */
export function requireUser(db: SqlClient, now: () => Date) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const match = BEARER.exec(c.req.header("Authorization") ?? "");
    if (!match?.[1]) return unauthorized(c);
    const tokenHash = hashSessionToken(match[1]);
    const userId = await sessionUser(db, tokenHash, now());
    if (!userId) return unauthorized(c);
    c.set("userId", userId);
    c.set("tokenHash", tokenHash);
    await next();
  });
}

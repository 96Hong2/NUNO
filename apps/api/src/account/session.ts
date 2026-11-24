import { createHash, randomBytes } from "node:crypto";
import type { SqlClient } from "../db/sql-client.ts";

/** 세션 토큰이 살아 있는 날 수. 다 지나면 다시 로그인한다. */
export const SESSION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로그인 신원을 낸 곳. `dev` 는 개발 전용 로그인이라 Apple 신원과 섞이지 않는다. */
export type IdentityProvider = "apple" | "dev";

export interface SignedIn {
  token: string;
  userId: string;
  created: boolean;
}

/** DB 에는 토큰 원문 대신 이 값을 둔다. */
export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** 신원으로 사용자를 찾거나 만들고 새 세션 토큰을 낸다. 토큰 원문은 응답으로만 나간다. */
export async function signIn(
  db: SqlClient,
  provider: IdentityProvider,
  subject: string,
  now: Date,
): Promise<SignedIn> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  const [row] = await db.query<{ user_id: string; created: boolean }>(
    "SELECT user_id, created FROM nuno_sign_in($1, $2, $3, $4, $5)",
    [provider, subject, hashSessionToken(token), expiresAt, now],
  );
  if (!row) throw new Error("nuno_sign_in 이 행을 주지 않았다");
  return { token, userId: row.user_id, created: row.created };
}

/** 살아 있는 세션의 사용자 ID. 만료, 철회, 정지 계정이면 null. */
export async function sessionUser(
  db: SqlClient,
  tokenHash: Buffer,
  now: Date,
): Promise<string | null> {
  const [row] = await db.query<{ user_id: string | null }>(
    "SELECT nuno_session_user($1, $2) AS user_id",
    [tokenHash, now],
  );
  return row?.user_id ?? null;
}

import { createHmac, timingSafeEqual } from "node:crypto";

/** 결과 보기 주소가 살아 있는 초. */
export const RESULT_URL_TTL_SECONDS = 10 * 60;

/** 결과 파일 키 꼴. 「gen30/」 이나 「u/」 아래, 영문, 숫자, `_`, `-`, `.` 조각만 받는다. */
const KEY = /^(gen30|u)(\/[A-Za-z0-9_.-]+)+$/;

/** 상위 폴더로 나가거나 절대 경로가 될 수 있는 키는 받지 않는다. */
export function isSafeKey(key: string): boolean {
  return KEY.test(key) && !key.split("/").some((part) => part === "." || part === "..");
}

const signature = (secret: string, key: string, exp: number) =>
  createHmac("sha256", secret).update(`${key}\n${exp}`).digest("base64url");

/** `/v1/files/<키>?exp=<초>&sig=<HMAC-SHA256>` 주소를 만든다. */
export function signFileUrl(
  baseUrl: string,
  secret: string,
  key: string,
  now: Date,
): { url: string; expiresAt: string } {
  if (!isSafeKey(key)) throw new Error(`결과 파일 키 꼴이 아니다: ${key}`);
  const exp = Math.floor(now.getTime() / 1000) + RESULT_URL_TTL_SECONDS;
  const url = `${baseUrl.replace(/\/$/, "")}/v1/files/${key}?exp=${exp}&sig=${signature(secret, key, exp)}`;
  return { url, expiresAt: new Date(exp * 1000).toISOString() };
}

/** 키 꼴, 기한, 서명이 모두 맞아야 참이다. */
export function verifyFileUrl(
  secret: string,
  key: string,
  exp: string | undefined,
  sig: string | undefined,
  now: Date,
): boolean {
  if (!isSafeKey(key) || !exp || !sig || !/^\d{1,12}$/.test(exp)) return false;
  const seconds = Number(exp);
  if (seconds * 1000 <= now.getTime()) return false;
  const expected = Buffer.from(signature(secret, key, seconds));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

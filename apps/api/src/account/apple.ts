import { createHash, createPublicKey, verify, type webcrypto } from "node:crypto";

export const APPLE_ISSUER = "https://appleid.apple.com";

/** Apple 공개 키 목록(JWKS)의 키 하나. RSA 키만 쓴다. */
export interface AppleJwk extends webcrypto.JsonWebKey {
  kid: string;
  kty: string;
}

export type IdentityCheck =
  | { ok: true; subject: string }
  | {
      ok: false;
      reason: "malformed" | "unknown_key" | "bad_signature" | "bad_claims" | "expired" | "nonce";
    };

/**
 * 서버가 Apple 로그인에 쓰는 바깥 일. 구현은 `adapters/apple-auth.ts` 다.
 * 설정 환경 변수가 없으면 composition 이 이 값을 넘기지 않고, 주소는 503 을 낸다.
 */
export interface AppleAuth {
  /** 신원 토큰을 Apple 공개 키로 확인한다. rawNonce 는 앱이 보낸 nonce 원문이다. */
  verifyIdentityToken(identityToken: string, rawNonce: string, now: Date): Promise<IdentityCheck>;
  /** 인가 코드를 refresh token 으로 바꿔 암호화한 글을 낸다. */
  exchangeAuthorizationCode(authorizationCode: string, now: Date): Promise<string>;
}

const decodePart = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 앱은 nonce 원문을 보내고, Apple 신원 토큰에는 그 SHA-256 hex 가 들어 있다. */
export const hashNonce = (rawNonce: string) => createHash("sha256").update(rawNonce).digest("hex");

/**
 * Apple 신원 토큰(JWT)을 확인한다. 바깥을 부르지 않는 순수 함수다.
 * 서명은 RS256 만 받는다(헤더의 alg 가 무엇이든 따르지 않는다). iss, aud, exp, nonce 를 본다.
 */
export function verifyAppleIdentityToken(
  identityToken: string,
  keys: readonly AppleJwk[],
  expected: { bundleId: string; rawNonce: string; now: Date },
): IdentityCheck {
  const parts = identityToken.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (!isRecord(header) || !isRecord(payload)) return { ok: false, reason: "malformed" };
  if (header.alg !== "RS256") return { ok: false, reason: "bad_signature" };

  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return { ok: false, reason: "unknown_key" };
  const valid = verify(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(signaturePart, "base64url"),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== APPLE_ISSUER || !audiences.includes(expected.bundleId)) {
    return { ok: false, reason: "bad_claims" };
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    return { ok: false, reason: "bad_claims" };
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= expected.now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (payload.nonce !== hashNonce(expected.rawNonce)) return { ok: false, reason: "nonce" };
  return { ok: true, subject: payload.sub };
}

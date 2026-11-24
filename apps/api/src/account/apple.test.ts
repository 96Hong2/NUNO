import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APPLE_ISSUER, hashNonce, verifyAppleIdentityToken, type AppleJwk } from "./apple.ts";

// 시험에서 만든 RSA 키와 JWKS 로 Apple 신원 토큰 확인을 본다. 네트워크와 목을 쓰지 않는다.
const BUNDLE_ID = "app.nuno.test";
const NOW = new Date("2030-01-01T00:00:00Z");
const NOW_SECONDS = NOW.getTime() / 1000;
const RAW_NONCE = "nonce-원문-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks: AppleJwk[] = [{ ...publicKey.export({ format: "jwk" }), kid: "key-1", kty: "RSA" }];

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function token(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  key = privateKey,
) {
  const head = b64url(JSON.stringify({ alg: "RS256", kid: "key-1", ...header }));
  const body = b64url(
    JSON.stringify({
      iss: APPLE_ISSUER,
      aud: BUNDLE_ID,
      sub: "001234.apple-user",
      exp: NOW_SECONDS + 600,
      nonce: hashNonce(RAW_NONCE),
      ...claims,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), key);
  return `${head}.${body}.${b64url(signature)}`;
}

const check = (identityToken: string, rawNonce = RAW_NONCE) =>
  verifyAppleIdentityToken(identityToken, jwks, { bundleId: BUNDLE_ID, rawNonce, now: NOW });

describe("Apple 신원 토큰 확인", () => {
  it("Apple 키로 서명하고 iss, aud, exp, nonce 가 맞으면 subject 를 준다", () => {
    expect(check(token())).toEqual({ ok: true, subject: "001234.apple-user" });
  });

  it("다른 키로 서명했거나 서명을 바꾸면 받지 않는다", () => {
    expect(check(token({}, {}, other.privateKey))).toEqual({ ok: false, reason: "bad_signature" });
    const [head, , signature] = token().split(".");
    const forged = b64url(JSON.stringify({ iss: APPLE_ISSUER, aud: BUNDLE_ID, sub: "someone" }));
    expect(check(`${head}.${forged}.${signature}`)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("RS256 이 아닌 alg 는 서명을 보지 않고 받지 않는다", () => {
    for (const alg of ["none", "HS256", "ES256"]) {
      expect(check(token({}, { alg }))).toEqual({ ok: false, reason: "bad_signature" });
    }
  });

  it("JWKS 에 없는 kid 는 받지 않는다", () => {
    expect(check(token({}, { kid: "key-2" }))).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("발급자나 받는 앱이 다르면 받지 않는다", () => {
    expect(check(token({ iss: "https://example.com" }))).toEqual({
      ok: false,
      reason: "bad_claims",
    });
    expect(check(token({ aud: "app.other" }))).toEqual({ ok: false, reason: "bad_claims" });
  });

  it("만료 시각이 지났으면 받지 않는다", () => {
    expect(check(token({ exp: NOW_SECONDS }))).toEqual({ ok: false, reason: "expired" });
  });

  it("앱이 보낸 nonce 원문의 SHA-256 이 토큰 nonce 와 다르면 받지 않는다", () => {
    expect(check(token(), "다른 nonce")).toEqual({ ok: false, reason: "nonce" });
    expect(check(token({ nonce: RAW_NONCE }))).toEqual({ ok: false, reason: "nonce" });
  });

  it("JWT 꼴이 아니면 받지 않는다", () => {
    expect(check("abc.def")).toEqual({ ok: false, reason: "malformed" });
    expect(check("a.b.c")).toEqual({ ok: false, reason: "malformed" });
  });
});

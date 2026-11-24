import { createCipheriv, createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";
import {
  APPLE_ISSUER,
  verifyAppleIdentityToken,
  type AppleAuth,
  type AppleJwk,
} from "../account/apple.ts";

const JWKS_URL = "https://appleid.apple.com/auth/keys";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
/** Apple 공개 키를 다시 받는 간격. 모르는 kid 가 오면 기다리지 않고 한 번 다시 받는다. */
const JWKS_TTL_MS = 60 * 60 * 1000;
/** client secret 은 짧게 쓰고 버린다. Apple 상한은 6개월이다. */
const CLIENT_SECRET_SECONDS = 5 * 60;

export interface AppleConfig {
  bundleId: string;
  teamId: string;
  keyId: string;
  /** .p8 키 PEM 원문 */
  privateKey: string;
  /** refresh token 암호화 키(base64, 32바이트) */
  tokenEncryptionKey: string;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** AES-256-GCM. 저장 글은 `v1.<iv>.<tag>.<암호문>` 이고 조각은 모두 base64url 이다. */
export function encryptRefreshToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", b64url(iv), b64url(cipher.getAuthTag()), b64url(encrypted)].join(".");
}

/** Apple 이 요구하는 ES256 client secret(JWT). */
function clientSecret(config: AppleConfig, key: KeyObject, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = b64url(
    JSON.stringify({
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + CLIENT_SECRET_SECONDS,
      aud: APPLE_ISSUER,
      sub: config.bundleId,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Apple 로그인 바깥 일: 공개 키 받기, 인가 코드 교환, refresh token 암호화. */
export function createAppleAuth(config: AppleConfig): AppleAuth {
  const encryptionKey = Buffer.from(config.tokenEncryptionKey, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("APPLE_TOKEN_ENC_KEY 는 base64 로 쓴 32바이트여야 한다");
  }
  // 환경 변수에 줄바꿈을 \n 글자로 넣은 PEM 도 받는다.
  const privateKey = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"));

  let cached: { keys: AppleJwk[]; fetchedAt: number } | null = null;
  async function loadKeys(force: boolean, now: Date): Promise<AppleJwk[]> {
    if (!force && cached && now.getTime() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
    const response = await fetch(JWKS_URL);
    if (!response.ok) throw new Error(`Apple 공개 키를 받지 못했다: ${response.status}`);
    const body = (await response.json()) as { keys?: AppleJwk[] };
    cached = { keys: body.keys ?? [], fetchedAt: now.getTime() };
    return cached.keys;
  }

  return {
    async verifyIdentityToken(identityToken, rawNonce, now) {
      const expected = { bundleId: config.bundleId, rawNonce, now };
      const first = verifyAppleIdentityToken(identityToken, await loadKeys(false, now), expected);
      if (first.ok || first.reason !== "unknown_key") return first;
      return verifyAppleIdentityToken(identityToken, await loadKeys(true, now), expected);
    },

    async exchangeAuthorizationCode(authorizationCode, now) {
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.bundleId,
          client_secret: clientSecret(config, privateKey, now),
          code: authorizationCode,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) throw new Error(`Apple 인가 코드 교환 실패: ${response.status}`);
      const body = (await response.json()) as { refresh_token?: string };
      if (!body.refresh_token) throw new Error("Apple 응답에 refresh_token 이 없다");
      return encryptRefreshToken(body.refresh_token, encryptionKey);
    },
  };
}

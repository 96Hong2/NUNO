import { serve } from "@hono/node-server";
import { createAppleAuth } from "../adapters/apple-auth.ts";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp } from "../app.ts";

// API 서버 시작점. DATABASE_URL 은 nuno_api 접속 주소다(비밀번호 포함, 저장소에 두지 않는다).
const env = process.env;
const url = env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 이 없다. nuno_api 접속 주소를 환경 변수로 넣는다");
const port = Number(env.PORT ?? 8787);

// Apple 설정이 하나라도 빠지면 Apple 로그인 주소는 503 을 낸다.
const {
  APPLE_BUNDLE_ID: bundleId,
  APPLE_TEAM_ID: teamId,
  APPLE_KEY_ID: keyId,
  APPLE_PRIVATE_KEY: privateKey,
  APPLE_TOKEN_ENC_KEY: tokenEncryptionKey,
} = env;
const apple =
  bundleId && teamId && keyId && privateKey && tokenEncryptionKey
    ? createAppleAuth({ bundleId, teamId, keyId, privateKey, tokenEncryptionKey })
    : null;

const devRoutes = env.NUNO_DEV_ROUTES === "1";
const webOrigins = (env.NUNO_WEB_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

serve({ fetch: createApp(openPostgres(url), { devRoutes, webOrigins, apple }).fetch, port });
console.log(`API 서버: http://localhost:${port}`);
if (devRoutes)
  console.log("개발 전용 주소 /v1/dev 를 켰다(NUNO_DEV_ROUTES=1). 운영에서는 켜지 않는다");
if (!apple) console.log("Apple 설정 환경 변수가 없어 /v1/auth/apple 은 503 을 낸다");

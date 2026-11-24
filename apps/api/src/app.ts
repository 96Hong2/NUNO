import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { AppleAuth } from "./account/apple.ts";
import { accountRoutes, devAccountRoutes } from "./account/routes.ts";
import { schemaVersion } from "./db/migrate.ts";
import type { SqlClient } from "./db/sql-client.ts";

interface FeatureSwitchRow {
  key: string;
  enabled: boolean;
}

/** 요청 본문 상한. 로그인 없이 부르는 주소도 큰 본문을 메모리에 올리지 않게 라우트 앞에서 막는다. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface AppOptions {
  /** 개발 전용 주소(`/v1/dev`)를 단다. 기본은 꺼짐이라 운영에서는 그 주소가 404 다. */
  devRoutes?: boolean;
  /** CORS 로 받을 웹 출처. 비어 있으면 CORS 머리글을 내지 않는다. */
  webOrigins?: readonly string[];
  /** 업무 시각. 기본은 시스템 시계, 시험은 고정 시각을 넘긴다. */
  now?: () => Date;
  /** Apple 설정이 없으면 null 이고 `/v1/auth/apple` 이 503 을 낸다. */
  apple?: AppleAuth | null;
}

/**
 * API 라우트. 앱은 이 주소들만 부르고 DB 에 직접 닿지 않는다.
 * 기능 스위치는 읽기만 연다. 바꾸는 주소는 두지 않고, 운영자가 nuno_ops 로 바꾼다.
 */
export function createApp(db: SqlClient, options: AppOptions = {}): Hono {
  const { devRoutes = false, webOrigins = [], now = () => new Date(), apple = null } = options;
  const app = new Hono();

  if (webOrigins.length > 0) {
    app.use(
      "*",
      cors({
        origin: [...webOrigins],
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        credentials: false,
      }),
    );
  }

  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "body_too_large" }, 413),
    }),
  );

  app.get("/v1/health", async (c) => c.json({ ok: true, schemaVersion: await schemaVersion(db) }));

  app.get("/v1/feature-switches", async (c) => {
    // 로그인 없이도 부르므로 이름과 켜짐만 낸다. 끈 까닭과 바꾼 사람은 운영 기록이다.
    const rows = await db.query<FeatureSwitchRow>(
      "SELECT key, enabled FROM feature_switches ORDER BY key",
    );
    return c.json({ switches: rows });
  });

  app.route("/", accountRoutes({ db, now, apple }));
  if (devRoutes) app.route("/v1/dev", devAccountRoutes({ db, now }));

  return app;
}

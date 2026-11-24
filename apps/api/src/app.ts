import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppleAuth } from "./account/apple.ts";
import { accountRoutes, devAccountRoutes } from "./account/routes.ts";
import { schemaVersion } from "./db/migrate.ts";
import type { SqlClient } from "./db/sql-client.ts";
import { fileRoutes, type FileRoutesDeps } from "./generation/file-routes.ts";
import type { ResultStore } from "./generation/ports.ts";
import { devGenerationRoutes, generationRoutes } from "./generation/routes.ts";
import { devGoldRoutes, goldRoutes } from "./gold/routes.ts";
import { lookbookRoutes } from "./lookbook/routes.ts";

interface FeatureSwitchRow {
  key: string;
  enabled: boolean;
}

export interface AppOptions {
  /** 개발 전용 주소(`/v1/dev`)를 단다. 기본은 꺼짐이라 운영에서는 그 주소가 404 다. */
  devRoutes?: boolean;
  /** CORS 로 받을 웹 출처. 비어 있으면 CORS 머리글을 내지 않는다. */
  webOrigins?: readonly string[];
  /** 업무 시각. 기본은 시스템 시계, 시험은 고정 시각을 넘긴다. */
  now?: () => Date;
  /** Apple 설정이 없으면 null 이고 `/v1/auth/apple` 이 503 을 낸다. */
  apple?: AppleAuth | null;
  /** 결과 사진 저장. 없으면 작업 주소(`/v1/generation-jobs`)와 룩북 주소를 달지 않는다. */
  results?: ResultStore | null;
  /** 로컬 디스크 결과 저장의 서명 주소(`/v1/files`). R2 를 쓰면 비운다. */
  files?: Omit<FileRoutesDeps, "now"> | null;
}

/**
 * API 라우트. 앱은 이 주소들만 부르고 DB 에 직접 닿지 않는다.
 * 기능 스위치는 읽기만 연다. 바꾸는 주소는 두지 않고, 운영자가 nuno_ops 로 바꾼다.
 */
export function createApp(db: SqlClient, options: AppOptions = {}): Hono {
  const {
    devRoutes = false,
    webOrigins = [],
    now = () => new Date(),
    apple = null,
    results = null,
    files = null,
  } = options;
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

  app.get("/v1/health", async (c) => c.json({ ok: true, schemaVersion: await schemaVersion(db) }));

  app.get("/v1/feature-switches", async (c) => {
    // 로그인 없이도 부르므로 이름과 켜짐만 낸다. 끈 까닭과 바꾼 사람은 운영 기록이다.
    const rows = await db.query<FeatureSwitchRow>(
      "SELECT key, enabled FROM feature_switches ORDER BY key",
    );
    return c.json({ switches: rows });
  });

  app.route("/", accountRoutes({ db, now, apple }));
  app.route("/", goldRoutes({ db, now }));
  if (results) {
    app.route("/", generationRoutes({ db, now, store: results }));
    app.route("/", lookbookRoutes({ db, now, store: results }));
  }
  if (files) app.route("/", fileRoutes({ ...files, now }));
  if (devRoutes) {
    app.route("/v1/dev", devAccountRoutes({ db, now }));
    app.route("/v1/dev", devGoldRoutes({ db, now }));
    app.route("/v1/dev", devGenerationRoutes({ db, now }));
  }

  return app;
}

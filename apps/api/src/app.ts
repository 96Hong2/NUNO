import { Hono } from "hono";
import { schemaVersion } from "./db/migrate.ts";
import type { SqlClient } from "./db/sql-client.ts";

interface FeatureSwitchRow {
  key: string;
  enabled: boolean;
}

/**
 * API 라우트. 앱은 이 주소들만 부르고 DB 에 직접 닿지 않는다.
 * 기능 스위치는 읽기만 연다. 바꾸는 주소는 두지 않고, 운영자가 nuno_ops 로 바꾼다.
 */
export function createApp(db: SqlClient): Hono {
  const app = new Hono();

  app.get("/v1/health", async (c) => c.json({ ok: true, schemaVersion: await schemaVersion(db) }));

  app.get("/v1/feature-switches", async (c) => {
    // 로그인 없이도 부르므로 이름과 켜짐만 낸다. 끈 까닭과 바꾼 사람은 운영 기록이다.
    const rows = await db.query<FeatureSwitchRow>(
      "SELECT key, enabled FROM feature_switches ORDER BY key",
    );
    return c.json({ switches: rows });
  });

  return app;
}

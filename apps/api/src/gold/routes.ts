import { Hono } from "hono";
import { requireUser, type AuthEnv } from "../account/require-user.ts";
import type { SqlClient } from "../db/sql-client.ts";
import { badRequest, readJsonObject } from "../http/request-body.ts";
import { goldSummary } from "./ledger.ts";

export interface GoldDeps {
  db: SqlClient;
  now: () => Date;
}

/** 시험용 골드 상한. 개발 서버에서 큰 값을 실수로 넣지 않게 막는다. */
const TEST_GOLD_MAX = 10_000;

export function goldRoutes({ db, now }: GoldDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.get("/v1/gold", requireUser(db, now), async (c) =>
    c.json(await goldSummary(db, c.get("userId"), now())),
  );
  return routes;
}

/** 개발 전용 시험용 골드. 사용자마다 한 번만 들어간다. NUNO_DEV_ROUTES=1 일 때만 `/v1/dev` 아래에 단다. */
export function devGoldRoutes({ db, now }: GoldDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.post("/gold", requireUser(db, now), async (c) => {
    const amount = (await readJsonObject(c))?.amount;
    if (
      !Number.isInteger(amount) ||
      (amount as number) <= 0 ||
      (amount as number) > TEST_GOLD_MAX
    ) {
      return badRequest(c, "invalid_body");
    }
    const [row] = await db.query<{ granted: boolean }>(
      "SELECT nuno_grant_test_gold($1, $2, $3) AS granted",
      [c.get("userId"), amount, now()],
    );
    return c.json({ granted: row?.granted ?? false });
  });
  return routes;
}

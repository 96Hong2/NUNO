import { Hono, type Context } from "hono";
import { CONSENT_TEXT_VERSION } from "../account/consent.ts";
import { requireUser, type AuthEnv } from "../account/require-user.ts";
import type { SqlClient } from "../db/sql-client.ts";
import { badRequest, readJsonObject } from "../http/request-body.ts";
import { keepResult } from "../lookbook/keep-result.ts";
import type { ResultStore } from "./ports.ts";
import { requestHash } from "./request-hash.ts";

export interface GenerationDeps {
  db: SqlClient;
  now: () => Date;
  store: ResultStore;
}

/** 접수 거절 코드와 HTTP 상태. */
const REJECTIONS: Record<string, 402 | 403 | 409 | 429 | 503> = {
  consent_required: 403,
  account_inactive: 403,
  insufficient_gold: 402,
  switch_off: 503,
  trial_daily_limit: 429,
  request_mismatch: 409,
};

const REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 입력 목록 JSON 글자 수 상한. 트윈 판과 옷 몇 벌이면 이보다 훨씬 작다. */
const MANIFEST_MAX_CHARS = 16_384;
const WORN_ITEMS_MAX_CHARS = 16_384;

interface JobRow {
  id: string;
  status: string;
  payment_kind: "trial" | "gold";
  failure_code: string | null;
  r2_key: string | null;
  storage_state: string | null;
  hold_status: string | null;
  hold_amount: number | null;
}

const JOB_VIEW = `
  SELECT j.id, j.status, j.payment_kind, j.failure_code, r.r2_key, r.storage_state,
         h.status AS hold_status, h.amount AS hold_amount
  FROM generation_jobs j
  LEFT JOIN generation_results r ON r.job_id = j.id
  LEFT JOIN gold_holds h ON h.ref_kind = 'generation_job' AND h.ref_id = j.id
  WHERE j.user_id = $1`;

const notFound = (c: Context) => c.json({ error: "not_found" }, 404);

/** 「이대로 입히기」 접수, 작업 조회, 결과 버리기와 저장. 사용자 ID 는 세션에서만 얻는다. */
export function generationRoutes({ db, now, store }: GenerationDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const auth = requireUser(db, now);

  async function view(row: JobRow | undefined) {
    if (!row) return null;
    const showResult =
      row.status === "succeeded" &&
      row.r2_key !== null &&
      (row.storage_state === "gen30" || row.storage_state === "kept");
    return {
      jobId: row.id,
      status: row.status,
      paymentKind: row.payment_kind,
      failureCode: row.failure_code,
      result: showResult && row.r2_key ? await store.signedUrl(row.r2_key, now()) : null,
      refund:
        row.hold_status === "released"
          ? { kind: row.payment_kind, amount: row.hold_amount ?? 0 }
          : null,
    };
  }

  routes.post("/v1/generation-jobs", auth, async (c) => {
    const body = await readJsonObject(c);
    const requestId = body?.requestId;
    const manifest = body?.manifest;
    const consentVersion = body?.consentVersion;
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
      return badRequest(c, "invalid_body");
    }
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      return badRequest(c, "invalid_body");
    }
    const manifestJson = JSON.stringify(manifest);
    if (manifestJson.length > MANIFEST_MAX_CHARS) return badRequest(c, "invalid_body");
    if (!Number.isInteger(consentVersion)) return badRequest(c, "invalid_body");
    // 앱 번들 문구가 서버 판과 다르면 동의 주소와 같은 409 를 준다. DB 에는 서버 판을 넘긴다.
    if (consentVersion !== CONSENT_TEXT_VERSION) {
      return c.json({ error: "consent_text_outdated" }, 409);
    }

    const [row] = await db.query<{
      job_id: string | null;
      status: string | null;
      payment_kind: string | null;
      error_code: string | null;
    }>("SELECT * FROM nuno_submit_job($1, $2, $3, $4, $5, $6)", [
      c.get("userId"),
      requestId,
      requestHash(manifest),
      manifestJson,
      CONSENT_TEXT_VERSION,
      now(),
    ]);
    if (!row) throw new Error("nuno_submit_job 이 행을 주지 않았다");
    if (row.error_code) {
      return c.json({ error: row.error_code }, REJECTIONS[row.error_code] ?? 400);
    }
    return c.json({ jobId: row.job_id, status: row.status, paymentKind: row.payment_kind }, 202);
  });

  routes.get("/v1/generation-jobs/by-request/:requestId", auth, async (c) => {
    const requestId = c.req.param("requestId");
    if (!REQUEST_ID.test(requestId)) return notFound(c);
    const [row] = await db.query<JobRow>(`${JOB_VIEW} AND j.idempotency_key = $2`, [
      c.get("userId"),
      requestId,
    ]);
    const job = await view(row);
    return job ? c.json(job) : notFound(c);
  });

  routes.get("/v1/generation-jobs/:id", auth, async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return notFound(c);
    const [row] = await db.query<JobRow>(`${JOB_VIEW} AND j.id = $2`, [c.get("userId"), id]);
    const job = await view(row);
    return job ? c.json(job) : notFound(c);
  });

  routes.post("/v1/generation-jobs/:id/discard", auth, async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return notFound(c);
    const [row] = await db.query<{ key: string | null }>(
      "SELECT nuno_discard_result($1, $2, $3) AS key",
      [c.get("userId"), id, now()],
    );
    if (!row?.key) return notFound(c);
    await store.remove(row.key);
    return c.body(null, 204);
  });

  routes.post("/v1/generation-jobs/:id/keep", auth, async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return notFound(c);
    const wornItems = (await readJsonObject(c))?.wornItems;
    if (!Array.isArray(wornItems) || JSON.stringify(wornItems).length > WORN_ITEMS_MAX_CHARS) {
      return badRequest(c, "invalid_body");
    }
    const lookId = await keepResult(db, store, c.get("userId"), id, wornItems, now());
    return lookId ? c.json({ lookId }) : notFound(c);
  });

  return routes;
}

const PROVIDER_MODES = new Set(["succeed", "refuse", "hang"]);
const DELAY_MAX_MS = 600_000;

/** 개발 전용 가짜 공급사 모드. 그 사용자의 다음 작업부터 worker 가 따른다. */
export function devGenerationRoutes({
  db,
  now,
}: Pick<GenerationDeps, "db" | "now">): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.post("/provider", requireUser(db, now), async (c) => {
    const body = await readJsonObject(c);
    const mode = body?.mode;
    const delayMs = body?.delayMs ?? 0;
    const failCheckOnce = body?.failCheckOnce ?? false;
    if (typeof mode !== "string" || !PROVIDER_MODES.has(mode)) return badRequest(c, "invalid_body");
    if (
      !Number.isInteger(delayMs) ||
      (delayMs as number) < 0 ||
      (delayMs as number) > DELAY_MAX_MS
    ) {
      return badRequest(c, "invalid_body");
    }
    if (typeof failCheckOnce !== "boolean") return badRequest(c, "invalid_body");
    await db.query("SELECT nuno_dev_set_provider_mode($1, $2, $3, $4)", [
      c.get("userId"),
      mode,
      delayMs,
      failCheckOnce,
    ]);
    return c.body(null, 204);
  });
  return routes;
}

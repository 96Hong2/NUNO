import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireUser, type AuthEnv } from "../account/require-user.ts";
import type { SqlClient } from "../db/sql-client.ts";
import type { ResultStore } from "./ports.ts";
import { UUID } from "./routes.ts";
import {
  sha256Hex,
  UPLOAD_MAX_BYTES,
  uploadFormat,
  uploadKey,
  UPLOADS_PER_DAY,
} from "./upload-check.ts";

export interface UploadDeps {
  db: SqlClient;
  now: () => Date;
  store: ResultStore;
}

/** 그림 바이트를 받는 주소. 앱 전체 본문 상한(`MAX_BODY_BYTES`)에서 빠지고 `UPLOAD_MAX_BYTES` 상한을 따로 단다. */
export const UPLOAD_CONTENT_PATH = /^\/v1\/uploads\/[^/]+$/;

/**
 * 생성 입력 옷 사진 올리기. 발급(`POST /v1/uploads`) 뒤 그림을 올리면(`PUT /v1/uploads/:id`) 검사하고 확정한다.
 * 로컬 디스크에서는 올리기와 확정이 한 주소다. R2 가 오면 앱이 서명 주소로 `tmp/` 에 올리고 확정 주소를 부른다.
 */
export function uploadRoutes({ db, now, store }: UploadDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const auth = requireUser(db, now);

  routes.post("/v1/uploads", auth, async (c) => {
    const [row] = await db.query<{ upload_id: string | null; error_code: string | null }>(
      "SELECT * FROM nuno_issue_upload($1, $2, $3)",
      [c.get("userId"), now(), UPLOADS_PER_DAY],
    );
    if (row?.error_code === "upload_daily_limit") return c.json({ error: row.error_code }, 429);
    if (!row?.upload_id) return c.json({ error: row?.error_code ?? "account_inactive" }, 403);
    return c.json({ uploadId: row.upload_id, maxBytes: UPLOAD_MAX_BYTES }, 201);
  });

  /**
   * 본문을 받기 전에 그 사용자의 줄인지 본다. 아니면 404 라 남의 ID 가 있는지 드러나지 않는다.
   * 이미 확정한 줄도 받는다. 응답이 끊겨 앱이 같은 바이트를 다시 보내면 같은 답을 준다.
   */
  const owned: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const id = c.req.param("id") ?? "";
    if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
    const [row] = await db.query<{ ok: boolean }>("SELECT nuno_upload_owned($1, $2) AS ok", [
      c.get("userId"),
      id,
    ]);
    if (!row?.ok) return c.json({ error: "not_found" }, 404);
    await next();
  };

  routes.put(
    "/v1/uploads/:id",
    auth,
    owned,
    bodyLimit({
      maxSize: UPLOAD_MAX_BYTES,
      onError: (c) => c.json({ error: "upload_too_large" }, 413),
    }),
    async (c) => {
      // DB 는 uuid 를 소문자 글자로 돌려준다. 키도 소문자로 만들어야 확정 함수의 키 비교가 맞는다.
      const id = c.req.param("id").toLowerCase();
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const format = uploadFormat(bytes);
      if (!format) return c.json({ error: "unsupported_format" }, 415);

      const userId = c.get("userId");
      const sha256 = sha256Hex(bytes);
      const key = uploadKey(userId, id, sha256, format);
      // 같은 ID 로 동시에 올리면 확정은 한쪽만 된다. 진 쪽은 자기 파일을 지운다.
      // 같은 바이트면 키가 같으므로, 먼저 확정된 줄이 가리키는 파일이면 지우지 않는다.
      const done = { uploadId: id, sha256, byteSize: bytes.length };
      await store.put(key, bytes, format.contentType);
      let confirmed: boolean;
      try {
        const [row] = await db.query<{ ok: boolean }>(
          "SELECT nuno_confirm_upload($1, $2, $3, $4, $5, $6, $7) AS ok",
          [userId, id, key, sha256, bytes.length, format.contentType, now()],
        );
        confirmed = row?.ok === true;
      } catch (error) {
        await store.remove(key);
        throw error;
      }
      if (confirmed) return c.json(done);
      const [kept] = await db.query<{ r2_key: string | null }>(
        "SELECT nuno_upload_key($1, $2) AS r2_key",
        [userId, id],
      );
      // 같은 바이트를 다시 보냈으면 키가 같다. 그 파일은 확정된 파일이라 지우지 않고 같은 답을 준다.
      if (kept?.r2_key === key) return c.json(done);
      await store.remove(key);
      return c.json({ error: "upload_already_confirmed" }, 409);
    },
  );

  return routes;
}

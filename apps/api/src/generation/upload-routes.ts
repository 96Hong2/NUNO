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

interface UploadState {
  status: "issued" | "confirmed";
  r2_key: string | null;
  sha256: string | null;
  byte_size: number | null;
}

type UploadEnv = AuthEnv & { Variables: { upload: UploadState & { id: string } } };

/** 그 사용자의 올리기 줄. 남의 줄과 없는 줄은 null 이다. */
async function uploadState(db: SqlClient, userId: string, id: string): Promise<UploadState | null> {
  const [row] = await db.query<UploadState>("SELECT * FROM nuno_upload_state($1, $2)", [userId, id]);
  return row ?? null;
}

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
export function uploadRoutes({ db, now, store }: UploadDeps): Hono<UploadEnv> {
  const routes = new Hono<UploadEnv>();
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
   * 이미 확정한 줄은 응답이 끊긴 앱의 재전송만 받는다. 머리글의 길이가 확정 때와 다르면 본문을 읽지 않고 409 다.
   */
  const owned: MiddlewareHandler<UploadEnv> = async (c, next) => {
    const id = (c.req.param("id") ?? "").toLowerCase();
    if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
    const state = await uploadState(db, c.get("userId"), id);
    if (!state) return c.json({ error: "not_found" }, 404);
    const length = c.req.header("Content-Length");
    if (state.status === "confirmed" && length !== undefined && length !== String(state.byte_size)) {
      return c.json({ error: "upload_already_confirmed" }, 409);
    }
    c.set("upload", { id, ...state });
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
      const upload = c.get("upload");
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const format = uploadFormat(bytes);
      if (!format) return c.json({ error: "unsupported_format" }, 415);

      const userId = c.get("userId");
      const sha256 = sha256Hex(bytes);
      const done = { uploadId: upload.id, sha256, byteSize: bytes.length };
      // 확정한 줄의 재전송은 파일을 다시 쓰지 않는다. worker 가 읽는 도중의 파일을 건드리지 않는다.
      if (upload.status === "confirmed") {
        return upload.sha256 === sha256
          ? c.json(done)
          : c.json({ error: "upload_already_confirmed" }, 409);
      }

      // DB 는 uuid 를 소문자 글자로 돌려준다. 키도 소문자 ID 로 만들어야 확정 함수의 키 비교가 맞는다.
      const key = uploadKey(userId, upload.id, sha256, format);
      let confirmed = false;
      try {
        await store.put(key, bytes, format.contentType);
        const [row] = await db.query<{ ok: boolean }>(
          "SELECT nuno_confirm_upload($1, $2, $3, $4, $5, $6, $7) AS ok",
          [userId, upload.id, key, sha256, bytes.length, format.contentType, now()],
        );
        confirmed = row?.ok === true;
      } finally {
        if (!confirmed) await removeUnlessConfirmed(userId, upload.id, key);
      }
      if (confirmed) return c.json(done);
      // 같은 ID 로 동시에 올려 다른 요청이 먼저 확정했다. 같은 바이트면 같은 답이다.
      const now_ = await uploadState(db, userId, upload.id);
      return now_?.sha256 === sha256
        ? c.json(done)
        : c.json({ error: "upload_already_confirmed" }, 409);
    },
  );

  /**
   * 확정되지 않은 이번 파일을 지운다. 같은 바이트로 먼저 확정된 줄이 같은 키를 가리키면 지우지 않는다.
   * 줄을 다시 읽지 못하면 지우지 않고 남긴다. 남은 파일은 버킷 수명 주기 규칙이 지운다.
   */
  async function removeUnlessConfirmed(userId: string, id: string, key: string) {
    const state = await uploadState(db, userId, id).catch(() => undefined);
    if (state === undefined || state?.r2_key === key) return;
    await store.remove(key);
  }

  return routes;
}

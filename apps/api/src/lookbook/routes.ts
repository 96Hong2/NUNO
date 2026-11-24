import { Hono, type Context } from "hono";
import { requireUser, type AuthEnv } from "../account/require-user.ts";
import type { SqlClient } from "../db/sql-client.ts";
import { badRequest, readJsonObject } from "../http/request-body.ts";
import type { ResultStore } from "../generation/ports.ts";

export interface LookbookDeps {
  db: SqlClient;
  now: () => Date;
  store: ResultStore;
}

/** 룩북 이름 글자 수 상한. 판 0003 의 `lookbooks.title` CHECK 와 같다. */
export const LOOKBOOK_TITLE_MAX = 12;
/** 책 표지에 보이는 룩 사진 수 */
const COVER_LIMIT = 4;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (c: Context) => c.json({ error: "not_found" }, 404);
const uniqueViolation = (error: unknown) => (error as { code?: string }).code === "23505";

interface LookRow {
  id: string;
  result_id: string;
  r2_key: string;
  worn_items: unknown[];
  is_favorite: boolean;
  saved_at: Date;
  lookbook_id: string | null;
  in_lookbooks: string[] | null;
}

// 지운 결과를 가리키는 줄은 보이지 않는다. 그 결과가 든 룩북 목록은 같은 사용자의 줄에서만 모은다.
const LOOK_COLUMNS = `
  l.id, l.result_id, r.r2_key, l.worn_items, l.is_favorite, l.saved_at, l.lookbook_id,
  (SELECT array_agg(o.lookbook_id::text ORDER BY o.saved_at, o.id) FROM looks o
   WHERE o.user_id = l.user_id AND o.result_id = l.result_id AND o.lookbook_id IS NOT NULL
  ) AS in_lookbooks`;
const LOOK_JOIN = `
  JOIN generation_results r ON r.id = l.result_id AND r.user_id = l.user_id
    AND r.storage_state <> 'deleted'`;

/** 룩북 책장, 룩 목록, 즐겨찾기, 복사와 옮기기. 사용자 ID 는 세션에서만 얻고 남의 행은 없는 것처럼 404 다. */
export function lookbookRoutes({ db, now, store }: LookbookDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const auth = requireUser(db, now);
  const sign = async (key: string) => (await store.signedUrl(key, now())).url;

  async function ownBook(userId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const rows = await db.query("SELECT 1 FROM lookbooks WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return rows.length > 0;
  }

  async function ownLook(
    userId: string,
    id: string,
  ): Promise<{
    result_id: string;
    lookbook_id: string | null;
    worn_items: unknown[];
    is_favorite: boolean;
  } | null> {
    if (!UUID.test(id)) return null;
    const [row] = await db.query<{
      result_id: string;
      lookbook_id: string | null;
      worn_items: unknown[];
      is_favorite: boolean;
    }>(
      `SELECT l.result_id, l.lookbook_id, l.worn_items, l.is_favorite FROM looks l ${LOOK_JOIN}
       WHERE l.user_id = $1 AND l.id = $2`,
      [userId, id],
    );
    return row ?? null;
  }

  async function lookView(row: LookRow) {
    return {
      lookId: row.id,
      resultId: row.result_id,
      imageUrl: await sign(row.r2_key),
      wornItems: row.worn_items,
      isFavorite: row.is_favorite,
      savedAt: row.saved_at.toISOString(),
      lookbookId: row.lookbook_id,
      inLookbooks: row.in_lookbooks ?? [],
    };
  }

  routes.get("/v1/lookbooks", auth, async (c) => {
    const userId = c.get("userId");
    const [all] = await db.query<{ n: number }>(
      `SELECT count(DISTINCT l.result_id)::int AS n FROM looks l ${LOOK_JOIN} WHERE l.user_id = $1`,
      [userId],
    );
    const books = await db.query<{ id: string; title: string; look_count: number }>(
      `SELECT b.id, b.title, count(r.id)::int AS look_count
       FROM lookbooks b
       LEFT JOIN looks l ON l.user_id = b.user_id AND l.lookbook_id = b.id
       LEFT JOIN generation_results r ON r.id = l.result_id AND r.user_id = l.user_id
         AND r.storage_state <> 'deleted'
       WHERE b.user_id = $1
       GROUP BY b.id
       ORDER BY b.sort_order, b.created_at, b.id`,
      [userId],
    );
    const covers = await db.query<{ lookbook_id: string; r2_key: string }>(
      `SELECT lookbook_id, r2_key FROM (
         SELECT l.lookbook_id, r.r2_key,
                row_number() OVER (PARTITION BY l.lookbook_id ORDER BY l.saved_at DESC, l.id) AS n
         FROM looks l ${LOOK_JOIN}
         WHERE l.user_id = $1 AND l.lookbook_id IS NOT NULL
       ) c WHERE n <= $2 ORDER BY lookbook_id, n`,
      [userId, COVER_LIMIT],
    );
    const coverKeys = new Map<string, string[]>();
    for (const row of covers) {
      coverKeys.set(row.lookbook_id, [...(coverKeys.get(row.lookbook_id) ?? []), row.r2_key]);
    }
    return c.json({
      allCount: all?.n ?? 0,
      books: await Promise.all(
        books.map(async (book) => ({
          id: book.id,
          title: book.title,
          lookCount: book.look_count,
          covers: await Promise.all((coverKeys.get(book.id) ?? []).map(sign)),
        })),
      ),
    });
  });

  routes.post("/v1/lookbooks", auth, async (c) => {
    const raw = (await readJsonObject(c))?.title;
    const title = typeof raw === "string" ? raw.trim() : "";
    // 글자 수는 DB char_length 와 같게 코드 포인트로 센다.
    const length = [...title].length;
    if (length < 1 || length > LOOKBOOK_TITLE_MAX) return badRequest(c, "invalid_title");
    const userId = c.get("userId");
    const [row] = await db.query<{ id: string; title: string }>(
      `INSERT INTO lookbooks (user_id, title, sort_order, created_at)
       SELECT $1, $2, coalesce(max(sort_order), 0) + 1, $3 FROM lookbooks WHERE user_id = $1
       RETURNING id, title`,
      [userId, title, now()],
    );
    if (!row) throw new Error("룩북 INSERT 가 행을 주지 않았다");
    return c.json({ id: row.id, title: row.title }, 201);
  });

  routes.get("/v1/looks", auth, async (c) => {
    const userId = c.get("userId");
    const lookbook = c.req.query("lookbook") ?? "all";
    if (lookbook === "all") {
      // 결과마다 한 줄: 「모든 룩」 줄(lookbook_id 가 빈 줄)이 있으면 그 줄, 없으면 가장 이른 줄.
      const rows = await db.query<LookRow>(
        `SELECT * FROM (
           SELECT DISTINCT ON (l.result_id) ${LOOK_COLUMNS}
           FROM looks l ${LOOK_JOIN}
           WHERE l.user_id = $1
           ORDER BY l.result_id, (l.lookbook_id IS NULL) DESC, l.saved_at, l.id
         ) one ORDER BY saved_at DESC, id`,
        [userId],
      );
      return c.json({ looks: await Promise.all(rows.map(lookView)) });
    }
    if (!(await ownBook(userId, lookbook))) return notFound(c);
    const rows = await db.query<LookRow>(
      `SELECT ${LOOK_COLUMNS} FROM looks l ${LOOK_JOIN}
       WHERE l.user_id = $1 AND l.lookbook_id = $2
       ORDER BY l.saved_at DESC, l.id`,
      [userId, lookbook],
    );
    return c.json({ looks: await Promise.all(rows.map(lookView)) });
  });

  routes.post("/v1/looks/:lookId/favorite", auth, async (c) => {
    const on = (await readJsonObject(c))?.on;
    if (typeof on !== "boolean") return badRequest(c, "invalid_body");
    const userId = c.get("userId");
    const look = await ownLook(userId, c.req.param("lookId"));
    if (!look) return notFound(c);
    // 별은 결과에 붙는다. 같은 결과를 가리키는 줄(여러 룩북)을 함께 바꾼다.
    await db.query("UPDATE looks SET is_favorite = $3 WHERE user_id = $1 AND result_id = $2", [
      userId,
      look.result_id,
      on,
    ]);
    return c.json({ lookId: c.req.param("lookId"), isFavorite: on });
  });

  routes.post("/v1/looks/:lookId/copy", auth, async (c) => {
    const target = (await readJsonObject(c))?.lookbookId;
    const userId = c.get("userId");
    const look = await ownLook(userId, c.req.param("lookId"));
    if (!look || typeof target !== "string" || !(await ownBook(userId, target))) {
      return notFound(c);
    }
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO looks (user_id, lookbook_id, result_id, is_favorite, worn_items, saved_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, lookbook_id, result_id) DO NOTHING
       RETURNING id`,
      [userId, target, look.result_id, look.is_favorite, JSON.stringify(look.worn_items), now()],
    );
    if (row) return c.json({ lookId: row.id }, 201);
    const [existing] = await db.query<{ id: string }>(
      "SELECT id FROM looks WHERE user_id = $1 AND lookbook_id = $2 AND result_id = $3",
      [userId, target, look.result_id],
    );
    return c.json({ lookId: existing?.id, already: true });
  });

  routes.post("/v1/looks/:lookId/move", auth, async (c) => {
    const target = (await readJsonObject(c))?.lookbookId;
    const userId = c.get("userId");
    const lookId = c.req.param("lookId");
    const look = await ownLook(userId, lookId);
    if (!look || typeof target !== "string" || !(await ownBook(userId, target))) {
      return notFound(c);
    }
    // 「모든 룩」 줄을 옮기면 「모든 룩」 에서 빠지는 결과가 생긴다. 복사만 받는다.
    if (look.lookbook_id === null) return c.json({ error: "all_looks_copy_only" }, 409);
    const already = await db.query(
      "SELECT 1 FROM looks WHERE user_id = $1 AND lookbook_id = $2 AND result_id = $3",
      [userId, target, look.result_id],
    );
    if (already.length > 0) return c.json({ error: "already_in_lookbook" }, 409);
    try {
      // 저장 시각은 그대로 둔다. 되돌리면 원래 룩북의 같은 자리로 돌아간다.
      await db.query("UPDATE looks SET lookbook_id = $3 WHERE user_id = $1 AND id = $2", [
        userId,
        lookId,
        target,
      ]);
    } catch (error) {
      if (uniqueViolation(error)) return c.json({ error: "already_in_lookbook" }, 409);
      throw error;
    }
    return c.json({ lookId, fromLookbookId: look.lookbook_id });
  });

  return routes;
}

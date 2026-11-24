import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalResultStore } from "../adapters/local-result-store.ts";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp } from "../app.ts";

// 실제 Postgres 에 붙는 룩북 시험. API 는 nuno_api 로 붙고, 다 만든 결과 행을 넣거나 줄을 셀 때만 관리자로 한다.
// 사용자는 시험마다 새로 만든다. 결과는 끝난(succeeded) 작업으로 넣어 worker 시험이 선점하지 않는다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!apiUrl || !adminUrl) {
  throw new Error("TEST_DATABASE_API_URL, TEST_DATABASE_ADMIN_URL 이 없다. pnpm test:db 로 돌린다");
}
const api = openPostgres(apiUrl);
const admin = openPostgres(adminUrl);

const NOW = new Date("2030-06-01T03:00:00Z");
let resultDir = "";
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  resultDir = await mkdtemp(join(tmpdir(), "nuno-lookbook-"));
  const store = createLocalResultStore({
    dir: resultDir,
    secret: "db-test",
    publicUrl: "http://api.test",
  });
  app = createApp(api, { devRoutes: true, now: () => NOW, results: store });
});

afterAll(async () => {
  await api.close();
  await admin.close();
  await rm(resultDir, { recursive: true, force: true });
});

interface SignedIn {
  token: string;
  userId: string;
}

interface LookView {
  lookId: string;
  resultId: string;
  imageUrl: string;
  isFavorite: boolean;
  lookbookId: string | null;
  inLookbooks: string[];
}

const call = async (path: string, token: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function newUser(): Promise<SignedIn> {
  const response = await app.request("/v1/dev/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: `db-test-${randomUUID()}` }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as SignedIn;
}

/** 다 만든 결과 하나를 관리자로 넣고 「내 룩북에 저장」 으로 「모든 룩」 줄을 만든다. 그 룩 ID 를 준다. */
async function savedLook(user: SignedIn, name = "그레이 더블 울 하프코트"): Promise<string> {
  const [job] = await admin.query<{ id: string }>(
    `INSERT INTO generation_jobs
       (user_id, idempotency_key, request_hash, input_manifest, payment_kind, status, created_at, finished_at)
     VALUES ($1, $2, 'x', '{}', 'trial', 'succeeded', $3, $3) RETURNING id`,
    [user.userId, `db-test-${randomUUID()}`, NOW],
  );
  const jobId = job?.id ?? "";
  const resultId = randomUUID();
  await admin.query(
    `INSERT INTO generation_results (id, job_id, user_id, r2_key, storage_state, created_at)
     VALUES ($1, $2, $3, $4, 'kept', $5)`,
    [resultId, jobId, user.userId, `u/${user.userId}/looks/${resultId}.jpg`, NOW],
  );
  const keep = await call(`/v1/generation-jobs/${jobId}/keep`, user.token, {
    method: "POST",
    body: { wornItems: [{ id: "s:w21", name, category: "outer", closet: null }] },
  });
  expect(keep.status).toBe(200);
  return ((await keep.json()) as { lookId: string }).lookId;
}

async function newBook(user: SignedIn, title: string): Promise<string> {
  const response = await call("/v1/lookbooks", user.token, { method: "POST", body: { title } });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function looksIn(user: SignedIn, lookbook: string): Promise<LookView[]> {
  const response = await call(`/v1/looks?lookbook=${lookbook}`, user.token);
  expect(response.status).toBe(200);
  return ((await response.json()) as { looks: LookView[] }).looks;
}

const copy = (user: SignedIn, lookId: string, lookbookId: string) =>
  call(`/v1/looks/${lookId}/copy`, user.token, { method: "POST", body: { lookbookId } });
const move = (user: SignedIn, lookId: string, lookbookId: string) =>
  call(`/v1/looks/${lookId}/move`, user.token, { method: "POST", body: { lookbookId } });

/** 그 룩 줄이 가리키는 결과의 줄 수(관리자로 센다) */
async function rowsOfResult(lookId: string): Promise<number> {
  const [row] = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM looks
     WHERE result_id = (SELECT result_id FROM looks WHERE id = $1)`,
    [lookId],
  );
  return row?.n ?? -1;
}

describe("룩북 만들기", () => {
  it("앞뒤 공백을 빼고 12자까지 받고, 13자와 빈 이름은 400, 같은 이름은 두 권 다 만든다", async () => {
    const user = await newUser();
    const twelve = "아주아주긴룩북이름열두글";
    expect([...twelve].length).toBe(12);
    const made = await call("/v1/lookbooks", user.token, {
      method: "POST",
      body: { title: `  ${twelve}  ` },
    });
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({ title: twelve });

    for (const title of [`${twelve}다`, "   ", "", 12]) {
      const refused = await call("/v1/lookbooks", user.token, { method: "POST", body: { title } });
      expect({ title, status: refused.status }).toEqual({ title, status: 400 });
    }
    await newBook(user, "겨울 여행");
    await newBook(user, "겨울 여행");
    const shelf = await call("/v1/lookbooks", user.token);
    const body = (await shelf.json()) as { allCount: number; books: { title: string }[] };
    expect(body.allCount).toBe(0);
    expect(body.books.map((book) => book.title)).toEqual([twelve, "겨울 여행", "겨울 여행"]);
  });
});

describe("복사와 옮기기", () => {
  it("복사하면 그 룩이 두 룩북에 다 있고, 같은 룩북으로 다시 복사하면 200 already 다", async () => {
    const user = await newUser();
    const lookId = await savedLook(user);
    const date = await newBook(user, "주말 데이트");
    const trip = await newBook(user, "겨울 여행");

    const first = await copy(user, lookId, date);
    expect(first.status).toBe(201);
    const inDate = ((await first.json()) as { lookId: string }).lookId;
    const second = await copy(user, inDate, trip);
    expect(second.status).toBe(201);

    const [dateLook] = await looksIn(user, date);
    const [tripLook] = await looksIn(user, trip);
    expect(dateLook?.resultId).toBe(tripLook?.resultId);
    // 시험 시계가 멈춰 있어 저장 시각이 같다. 순서는 보지 않는다.
    expect([...(dateLook?.inLookbooks ?? [])].sort()).toEqual([date, trip].sort());
    // 「모든 룩」 에는 결과마다 한 줄, 「모든 룩」 줄 그대로다.
    const all = await looksIn(user, "all");
    expect(all.map((look) => look.lookId)).toEqual([lookId]);
    expect(all[0]?.imageUrl).toMatch(/^http:\/\/api\.test\/v1\/files\/u\//);

    const again = await copy(user, lookId, trip);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ lookId: tripLook?.lookId, already: true });
    expect(await rowsOfResult(lookId)).toBe(3);

    const shelf = (await (await call("/v1/lookbooks", user.token)).json()) as {
      allCount: number;
      books: { id: string; lookCount: number; covers: string[] }[];
    };
    expect(shelf.allCount).toBe(1);
    expect(shelf.books.map((book) => [book.id, book.lookCount, book.covers.length])).toEqual([
      [date, 1, 1],
      [trip, 1, 1],
    ]);
  });

  it("옮기면 지금 룩북에서 빠지고, 같은 주소로 원래 룩북에 옮기면 되돌아간다", async () => {
    const user = await newUser();
    const lookId = await savedLook(user);
    const date = await newBook(user, "주말 데이트");
    const trip = await newBook(user, "겨울 여행");
    const inDate = ((await (await copy(user, lookId, date)).json()) as { lookId: string }).lookId;

    const moved = await move(user, inDate, trip);
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ lookId: inDate, fromLookbookId: date });
    expect(await looksIn(user, date)).toEqual([]);
    expect((await looksIn(user, trip)).map((look) => look.lookId)).toEqual([inDate]);

    const undo = await move(user, inDate, date);
    expect(undo.status).toBe(200);
    expect((await looksIn(user, date)).map((look) => look.lookId)).toEqual([inDate]);
    expect(await looksIn(user, trip)).toEqual([]);
    expect(await rowsOfResult(lookId)).toBe(2);
  });

  it("「모든 룩」 줄을 옮기면 409 all_looks_copy_only, 대상에 이미 있으면 409 already_in_lookbook 이다", async () => {
    const user = await newUser();
    const lookId = await savedLook(user);
    const date = await newBook(user, "주말 데이트");
    const trip = await newBook(user, "겨울 여행");

    const fromAll = await move(user, lookId, date);
    expect(fromAll.status).toBe(409);
    expect(await fromAll.json()).toEqual({ error: "all_looks_copy_only" });

    const inDate = ((await (await copy(user, lookId, date)).json()) as { lookId: string }).lookId;
    await copy(user, inDate, trip);
    const already = await move(user, inDate, trip);
    expect(already.status).toBe(409);
    expect(await already.json()).toEqual({ error: "already_in_lookbook" });
    expect((await looksIn(user, date)).map((look) => look.lookId)).toEqual([inDate]);
  });
});

describe("즐겨찾기", () => {
  it("별을 켜고 끄면 같은 결과를 가리키는 줄이 모두 함께 바뀐다", async () => {
    const user = await newUser();
    const lookId = await savedLook(user);
    const other = await savedLook(user, "블랙 시어링 무스탕 자켓");
    const date = await newBook(user, "주말 데이트");
    const inDate = ((await (await copy(user, lookId, date)).json()) as { lookId: string }).lookId;

    const on = await call(`/v1/looks/${inDate}/favorite`, user.token, {
      method: "POST",
      body: { on: true },
    });
    expect(on.status).toBe(200);
    const favorites = async () =>
      admin.query<{ id: string; is_favorite: boolean }>(
        "SELECT id, is_favorite FROM looks WHERE user_id = $1 ORDER BY id",
        [user.userId],
      );
    expect(Object.fromEntries((await favorites()).map((row) => [row.id, row.is_favorite]))).toEqual(
      { [lookId]: true, [inDate]: true, [other]: false },
    );
    const all = await looksIn(user, "all");
    expect(all.find((look) => look.lookId === lookId)?.isFavorite).toBe(true);

    await call(`/v1/looks/${lookId}/favorite`, user.token, { method: "POST", body: { on: false } });
    expect((await favorites()).every((row) => !row.is_favorite)).toBe(true);
  });
});

describe("남의 룩북과 룩", () => {
  it("다른 사용자의 룩북으로 복사하거나 옮기면 404 이고, 남의 룩은 별, 복사, 옮기기, 목록 모두 404 다", async () => {
    const owner = await newUser();
    const ownerLook = await savedLook(owner);
    const ownerBook = await newBook(owner, "겨울 여행");
    const ownerInBook = (
      (await (await copy(owner, ownerLook, ownerBook)).json()) as { lookId: string }
    ).lookId;

    const intruder = await newUser();
    const mine = await savedLook(intruder);
    const myBook = await newBook(intruder, "주말 데이트");
    const mineInBook = ((await (await copy(intruder, mine, myBook)).json()) as { lookId: string })
      .lookId;

    const attempts = [
      ["내 룩을 남의 룩북으로 복사", await copy(intruder, mine, ownerBook)],
      ["내 룩을 남의 룩북으로 옮기기", await move(intruder, mineInBook, ownerBook)],
      ["남의 룩을 내 룩북으로 복사", await copy(intruder, ownerLook, myBook)],
      ["남의 룩을 내 룩북으로 옮기기", await move(intruder, ownerInBook, myBook)],
      [
        "남의 룩 별",
        await call(`/v1/looks/${ownerLook}/favorite`, intruder.token, {
          method: "POST",
          body: { on: true },
        }),
      ],
      ["남의 룩북 목록", await call(`/v1/looks?lookbook=${ownerBook}`, intruder.token)],
    ] as const;
    for (const [name, response] of attempts) {
      expect({ name, status: response.status }).toEqual({ name, status: 404 });
    }

    expect((await looksIn(owner, ownerBook)).map((look) => look.lookId)).toEqual([ownerInBook]);
    expect((await looksIn(owner, "all")).every((look) => !look.isFavorite)).toBe(true);
    expect((await looksIn(intruder, myBook)).map((look) => look.lookId)).toEqual([mineInBook]);
    const [row] = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM looks WHERE lookbook_id = $1",
      [ownerBook],
    );
    expect(row?.n).toBe(1);
  });
});

import type { Migration, SqlExecutor } from "@nuno/device-db";
import type { Look, LookItem } from "../domain";

/**
 * 룩 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다.
 * 입은 옷은 이름까지 사본으로 둔다. 옷장 옷으로 만든 룩(옷 ID 와 그림 사본)은 그런 룩을 만드는 길이 생길 때 판을 더한다.
 */
export const createLookTables: Omit<Migration, "version"> = {
  name: "create-looks",
  async up(tx) {
    await tx.exec(`CREATE TABLE looks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      twin_key TEXT NOT NULL,
      photo_key TEXT,
      created_at TEXT NOT NULL
    )`);
    await tx.exec(`CREATE TABLE look_items (
      look_id TEXT NOT NULL REFERENCES looks (id),
      position INTEGER NOT NULL,
      sample_key TEXT NOT NULL,
      category TEXT NOT NULL,
      slot TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (look_id, position)
    )`);
  },
};

interface LookRow {
  id: string;
  title: string;
  twin_key: string;
  photo_key: string | null;
  created_at: string;
}

interface ItemRow {
  look_id: string;
  sample_key: string;
  category: string;
  slot: string;
  name: string;
}

/**
 * 룩을 넣는다. 같은 ID 가 이미 있으면 넣지 않고 false 를 돌려준다(저장 단추 연타).
 * 부르는 쪽이 트랜잭션으로 묶고, false 면 같은 트랜잭션의 나머지 쓰기를 건너뛴다.
 */
export async function insertLook(db: SqlExecutor, look: Look): Promise<boolean> {
  const result = await db.run(
    "INSERT INTO looks (id, title, twin_key, photo_key, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
    [look.id, look.title, look.twinKey, look.photoKey, look.createdAt],
  );
  if (result.changes === 0) return false;
  for (const [position, item] of look.items.entries()) {
    await db.run(
      "INSERT INTO look_items (look_id, position, sample_key, category, slot, name) VALUES (?, ?, ?, ?, ?, ?)",
      [look.id, position, item.sampleKey, item.category, item.slot, item.name],
    );
  }
  return true;
}

/** 모든 룩(「모든 룩」 룩북), 최근에 저장한 것부터 */
export async function listLooks(db: SqlExecutor): Promise<Look[]> {
  const rows = await db.all<LookRow>(
    "SELECT id, title, twin_key, photo_key, created_at FROM looks ORDER BY created_at DESC, rowid DESC",
  );
  if (rows.length === 0) return [];
  const items = await db.all<ItemRow>(
    `SELECT look_id, sample_key, category, slot, name FROM look_items WHERE look_id IN (${rows.map(() => "?").join(", ")}) ORDER BY look_id, position`,
    rows.map((row) => row.id),
  );
  const byLook = new Map<string, LookItem[]>();
  for (const item of items) {
    const list = byLook.get(item.look_id) ?? [];
    list.push({
      sampleKey: item.sample_key,
      category: item.category,
      slot: item.slot,
      name: item.name,
    });
    byLook.set(item.look_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    twinKey: row.twin_key,
    photoKey: row.photo_key,
    createdAt: row.created_at,
    items: byLook.get(row.id) ?? [],
  }));
}

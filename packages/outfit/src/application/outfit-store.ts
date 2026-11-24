import type { Migration, SqlExecutor } from "@nuno/device-db";
import { sameOutfit } from "../domain";
import type { Outfit, OutfitCategory, OutfitPiece, OutfitSlot, RecentOutfit } from "../domain";

/**
 * 코디 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다.
 * kind: current(트윈마다 지금 입은 코디 하나), saved(「내 코디」 칸, position 이 칸 번호 1~5), recent(최근 줄, position 이 순서).
 * 옷은 옷장 옷 ID 나 견본 옷 키 가운데 하나로 가리킨다.
 */
export const createOutfitTables: Omit<Migration, "version"> = {
  name: "create-outfits",
  async up(tx) {
    await tx.exec(`CREATE TABLE outfits (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('current', 'saved', 'recent')),
      twin_key TEXT NOT NULL,
      position INTEGER NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await tx.exec(
      "CREATE UNIQUE INDEX outfits_current ON outfits (twin_key) WHERE kind = 'current'",
    );
    await tx.exec(
      "CREATE UNIQUE INDEX outfits_saved_slot ON outfits (position) WHERE kind = 'saved'",
    );
    await tx.exec(`CREATE TABLE outfit_items (
      outfit_id TEXT NOT NULL REFERENCES outfits (id),
      position INTEGER NOT NULL,
      garment_id TEXT,
      sample_key TEXT,
      category TEXT NOT NULL,
      slot TEXT NOT NULL,
      PRIMARY KEY (outfit_id, position),
      CHECK ((garment_id IS NULL) <> (sample_key IS NULL))
    )`);
  },
};

interface ItemRow {
  outfit_id: string;
  garment_id: string | null;
  sample_key: string | null;
  category: string;
  slot: string;
}

interface OutfitRow {
  id: string;
  twin_key: string;
  position: number;
  title: string | null;
}

export interface SavedOutfit {
  id: string;
  slot: number;
  title: string;
  twinKey: string;
  outfit: Outfit;
}

function toPiece(row: ItemRow): OutfitPiece {
  return {
    ref:
      row.garment_id !== null
        ? { kind: "garment", id: row.garment_id }
        : { kind: "sample", key: row.sample_key ?? "" },
    category: row.category as OutfitCategory,
    slot: row.slot as OutfitSlot,
  };
}

async function itemsOf(
  db: SqlExecutor,
  ids: readonly string[],
): Promise<Map<string, OutfitPiece[]>> {
  const map = new Map<string, OutfitPiece[]>();
  if (ids.length === 0) return map;
  const rows = await db.all<ItemRow>(
    `SELECT outfit_id, garment_id, sample_key, category, slot FROM outfit_items WHERE outfit_id IN (${ids.map(() => "?").join(", ")}) ORDER BY outfit_id, position`,
    ids,
  );
  for (const row of rows) map.set(row.outfit_id, [...(map.get(row.outfit_id) ?? []), toPiece(row)]);
  return map;
}

async function writeItems(db: SqlExecutor, outfitId: string, outfit: Outfit): Promise<void> {
  await db.run("DELETE FROM outfit_items WHERE outfit_id = ?", [outfitId]);
  for (const [index, piece] of outfit.entries()) {
    await db.run(
      "INSERT INTO outfit_items (outfit_id, position, garment_id, sample_key, category, slot) VALUES (?, ?, ?, ?, ?, ?)",
      [
        outfitId,
        index,
        piece.ref.kind === "garment" ? piece.ref.id : null,
        piece.ref.kind === "sample" ? piece.ref.key : null,
        piece.category,
        piece.slot,
      ],
    );
  }
}

/** 그 트윈이 지금 입은 코디. 한 번도 정하지 않았으면 null(기본 코디를 쓴다). */
export async function readCurrentOutfit(db: SqlExecutor, twinKey: string): Promise<Outfit | null> {
  const row = await db.get<OutfitRow>(
    "SELECT id FROM outfits WHERE kind = 'current' AND twin_key = ?",
    [twinKey],
  );
  if (!row) return null;
  return (await itemsOf(db, [row.id])).get(row.id) ?? [];
}

/** 지금 입은 코디를 덮어쓴다. id 는 처음 만들 때만 쓴다. 부르는 쪽이 트랜잭션으로 묶는다. */
export async function writeCurrentOutfit(
  db: SqlExecutor,
  twinKey: string,
  outfit: Outfit,
  newId: string,
  now: string,
): Promise<void> {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM outfits WHERE kind = 'current' AND twin_key = ?",
    [twinKey],
  );
  const id = row?.id ?? newId;
  if (row) await db.run("UPDATE outfits SET updated_at = ? WHERE id = ?", [now, id]);
  else {
    await db.run(
      "INSERT INTO outfits (id, kind, twin_key, position, created_at, updated_at) VALUES (?, 'current', ?, 0, ?, ?)",
      [id, twinKey, now, now],
    );
  }
  await writeItems(db, id, outfit);
}

export async function listSavedOutfits(db: SqlExecutor): Promise<SavedOutfit[]> {
  const rows = await db.all<OutfitRow>(
    "SELECT id, twin_key, position, title FROM outfits WHERE kind = 'saved' ORDER BY position",
  );
  const items = await itemsOf(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    slot: row.position,
    title: row.title ?? "",
    twinKey: row.twin_key,
    outfit: items.get(row.id) ?? [],
  }));
}

/** 「내 코디」 칸에 담는다. 그 칸에 코디가 있으면 덮어쓴다(「이 칸에 덮어쓰기」). */
export async function saveOutfitToSlot(
  db: SqlExecutor,
  saved: SavedOutfit,
  now: string,
): Promise<void> {
  const old = await db.get<{ id: string }>(
    "SELECT id FROM outfits WHERE kind = 'saved' AND position = ?",
    [saved.slot],
  );
  if (old) await deleteOutfit(db, old.id);
  await db.run(
    "INSERT INTO outfits (id, kind, twin_key, position, title, created_at, updated_at) VALUES (?, 'saved', ?, ?, ?, ?, ?)",
    [saved.id, saved.twinKey, saved.slot, saved.title, now, now],
  );
  await writeItems(db, saved.id, saved.outfit);
}

export async function renameSavedOutfit(
  db: SqlExecutor,
  id: string,
  title: string,
  now: string,
): Promise<void> {
  await db.run("UPDATE outfits SET title = ?, updated_at = ? WHERE id = ? AND kind = 'saved'", [
    title,
    now,
    id,
  ]);
}

/** 「내 코디」 칸을 지우고 뒤 칸을 앞으로 당긴다. */
export async function deleteSavedOutfit(db: SqlExecutor, id: string): Promise<void> {
  const row = await db.get<{ position: number }>(
    "SELECT position FROM outfits WHERE id = ? AND kind = 'saved'",
    [id],
  );
  if (!row) return;
  await deleteOutfit(db, id);
  const later = await db.all<{ id: string; position: number }>(
    "SELECT id, position FROM outfits WHERE kind = 'saved' AND position > ? ORDER BY position",
    [row.position],
  );
  for (const item of later) {
    await db.run("UPDATE outfits SET position = ? WHERE id = ?", [item.position - 1, item.id]);
  }
}

async function deleteOutfit(db: SqlExecutor, id: string): Promise<void> {
  await db.run("DELETE FROM outfit_items WHERE outfit_id = ?", [id]);
  await db.run("DELETE FROM outfits WHERE id = ?", [id]);
}

export async function listRecentOutfits(db: SqlExecutor): Promise<RecentOutfit[]> {
  const rows = await db.all<OutfitRow>(
    "SELECT id, twin_key, position, title FROM outfits WHERE kind = 'recent' ORDER BY position",
  );
  const items = await itemsOf(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    twinKey: row.twin_key,
    outfit: items.get(row.id) ?? [],
  }));
}

/** 최근 줄 전체를 새 줄로 바꾼다. 부르는 쪽이 트랜잭션으로 묶는다. */
export async function replaceRecentOutfits(
  db: SqlExecutor,
  recents: readonly RecentOutfit[],
  now: string,
): Promise<void> {
  const old = await db.all<{ id: string }>("SELECT id FROM outfits WHERE kind = 'recent'");
  for (const row of old) await deleteOutfit(db, row.id);
  for (const [index, recent] of recents.entries()) {
    await db.run(
      "INSERT INTO outfits (id, kind, twin_key, position, created_at, updated_at) VALUES (?, 'recent', ?, ?, ?, ?)",
      [recent.id, recent.twinKey, index, now, now],
    );
    await writeItems(db, recent.id, recent.outfit);
  }
}

/**
 * 옷장에서 옷을 지우면 그 옷이 든 코디에서도 뺀다. 부르는 쪽이 트랜잭션으로 묶는다.
 * 비게 된 내 코디 칸은 지우고 뒤 칸을 당긴다. 최근 줄은 1벌 이하 카드와 같은 조합 카드를 뺀다.
 */
export async function removeGarmentFromOutfits(
  db: SqlExecutor,
  garmentId: string,
  now: string,
): Promise<void> {
  await db.run("DELETE FROM outfit_items WHERE garment_id = ?", [garmentId]);
  const emptySaved = await db.all<{ id: string }>(
    "SELECT o.id FROM outfits o WHERE o.kind = 'saved' AND NOT EXISTS (SELECT 1 FROM outfit_items i WHERE i.outfit_id = o.id) ORDER BY o.position DESC",
  );
  for (const row of emptySaved) await deleteSavedOutfit(db, row.id);
  const recents = await listRecentOutfits(db);
  const kept = recents.filter(
    (item, index) =>
      item.outfit.length > 1 &&
      recents.findIndex(
        (other) => other.twinKey === item.twinKey && sameOutfit(other.outfit, item.outfit),
      ) === index,
  );
  if (kept.length !== recents.length) await replaceRecentOutfits(db, kept, now);
}

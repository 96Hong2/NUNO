import type { Migration, SqlExecutor, SqlValue } from "@nuno/device-db";
import {
  isClosetKey,
  isGarmentCategory,
  isGarmentColor,
  isSeason,
  isSizeLabel,
  type ClosetKey,
  type CutoutSource,
  type Garment,
  type GarmentMethod,
} from "../domain";

/**
 * 옷장 두 칸 표와 넣은 길 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다.
 * 옷장 화면과 옷 넣기가 쓰는 칸만 만든다. 견본 옷 키, 「이대로 입히기」 제외 같은 칸은 그 기능이 생길 때 새 판에서 더한다.
 */
export const createGarmentTables: Omit<Migration, "version"> = {
  name: "create-garments",
  async up(tx) {
    await tx.exec(`CREATE TABLE garments (
      id TEXT PRIMARY KEY,
      closet TEXT NOT NULL CHECK (closet IN ('mine', 'wanted')),
      is_favorite INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      season TEXT NOT NULL DEFAULT '[]',
      price_krw INTEGER,
      link_url TEXT,
      size_label TEXT,
      measurements TEXT NOT NULL DEFAULT '{}',
      placement_x REAL,
      placement_y REAL,
      placement_scale REAL,
      cutout_source TEXT NOT NULL,
      mask_edited INTEGER NOT NULL DEFAULT 0,
      original_path TEXT NOT NULL,
      cutout_path TEXT NOT NULL,
      thumb_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await tx.exec("CREATE INDEX garments_closet_favorite ON garments (closet, is_favorite)");
    await tx.exec(`CREATE TABLE garment_sources (
      garment_id TEXT PRIMARY KEY REFERENCES garments (id),
      method TEXT NOT NULL,
      had_person INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
  },
};

/** 옷 넣기 마지막 단추가 넘기는 값. id 는 사진을 고를 때 정해져 담기를 연타해도 같다. */
export interface NewGarment extends Omit<Garment, "isFavorite" | "createdAt" | "updatedAt"> {
  method: GarmentMethod;
  hadPerson: boolean;
}

interface GarmentRow {
  id: string;
  closet: string;
  is_favorite: number;
  category: string;
  color: string;
  name: string;
  brand: string | null;
  season: string;
  price_krw: number | null;
  link_url: string | null;
  size_label: string | null;
  measurements: string;
  placement_x: number | null;
  placement_y: number | null;
  placement_scale: number | null;
  cutout_source: string;
  mask_edited: number;
  original_path: string;
  cutout_path: string;
  thumb_path: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, closet, is_favorite, category, color, name, brand, season, price_krw, link_url, size_label, measurements, placement_x, placement_y, placement_scale, cutout_source, mask_edited, original_path, cutout_path, thumb_path, created_at, updated_at";

function toGarment(row: GarmentRow): Garment {
  if (!isClosetKey(row.closet) || !isGarmentCategory(row.category) || !isGarmentColor(row.color)) {
    throw new Error(`옷 ${row.id} 의 칸, 종류, 색 값이 목록에 없다`);
  }
  const seasons = (JSON.parse(row.season) as unknown[]).filter(isSeason);
  const placement =
    row.placement_x === null || row.placement_y === null || row.placement_scale === null
      ? null
      : { x: row.placement_x, y: row.placement_y, scale: row.placement_scale };
  return {
    id: row.id,
    closet: row.closet,
    isFavorite: row.is_favorite === 1,
    category: row.category,
    color: row.color,
    name: row.name,
    brand: row.brand,
    seasons,
    priceKrw: row.price_krw,
    linkUrl: row.link_url,
    sizeLabel: isSizeLabel(row.size_label) ? row.size_label : null,
    measurements: JSON.parse(row.measurements) as Record<string, number>,
    placement,
    cutoutSource: row.cutout_source as CutoutSource,
    maskEdited: row.mask_edited === 1,
    originalPath: row.original_path,
    cutoutPath: row.cutout_path,
    thumbPath: row.thumb_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 옷 한 벌과 넣은 길을 넣는다. 같은 id 로 다시 부르면 아무것도 바꾸지 않고 false 를 낸다.
 * 두 표 쓰기는 부르는 쪽이 트랜잭션 하나로 묶는다.
 */
export async function insertGarment(
  db: SqlExecutor,
  garment: NewGarment,
  now: string,
): Promise<boolean> {
  const params: SqlValue[] = [
    garment.id,
    garment.closet,
    garment.category,
    garment.color,
    garment.name,
    garment.brand,
    JSON.stringify(garment.seasons),
    garment.priceKrw,
    garment.linkUrl,
    garment.sizeLabel,
    JSON.stringify(garment.measurements),
    garment.placement?.x ?? null,
    garment.placement?.y ?? null,
    garment.placement?.scale ?? null,
    garment.cutoutSource,
    garment.maskEdited ? 1 : 0,
    garment.originalPath,
    garment.cutoutPath,
    garment.thumbPath,
    now,
    now,
  ];
  const result = await db.run(
    `INSERT INTO garments (id, closet, category, color, name, brand, season, price_krw, link_url, size_label, measurements, placement_x, placement_y, placement_scale, cutout_source, mask_edited, original_path, cutout_path, thumb_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    params,
  );
  if (result.changes === 0) return false;
  await db.run(
    "INSERT INTO garment_sources (garment_id, method, had_person, created_at) VALUES (?, ?, ?, ?)",
    [garment.id, garment.method, garment.hadPerson ? 1 : 0, now],
  );
  return true;
}

/** 한 칸의 옷. 마지막에 넣은 옷이 앞이다. */
export async function listCloset(db: SqlExecutor, closet: ClosetKey): Promise<Garment[]> {
  const rows = await db.all<GarmentRow>(
    `SELECT ${COLUMNS} FROM garments WHERE closet = ? ORDER BY created_at DESC, rowid DESC`,
    [closet],
  );
  return rows.map(toGarment);
}

/** 두 칸을 합쳐 마지막에 넣은 옷부터 limit 벌. 홈 「최근 넣은 옷」 탭이 쓴다. */
export async function listRecentGarments(db: SqlExecutor, limit: number): Promise<Garment[]> {
  const rows = await db.all<GarmentRow>(
    `SELECT ${COLUMNS} FROM garments ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toGarment);
}

export async function readGarment(db: SqlExecutor, id: string): Promise<Garment | null> {
  const row = await db.get<GarmentRow>(`SELECT ${COLUMNS} FROM garments WHERE id = ?`, [id]);
  return row ? toGarment(row) : null;
}

export interface ClosetCounts {
  mine: number;
  wanted: number;
  favorites: Record<ClosetKey, number>;
}

/** 칸별 옷 수와 칸별 즐겨찾기 수. 즐겨찾기는 칸마다 따로 센다. */
export async function countCloset(db: SqlExecutor): Promise<ClosetCounts> {
  const rows = await db.all<{ closet: string; total: number; favorites: number }>(
    "SELECT closet, COUNT(*) AS total, SUM(is_favorite) AS favorites FROM garments GROUP BY closet",
  );
  const counts: ClosetCounts = { mine: 0, wanted: 0, favorites: { mine: 0, wanted: 0 } };
  for (const row of rows) {
    if (!isClosetKey(row.closet)) continue;
    counts[row.closet] = row.total;
    counts.favorites[row.closet] = row.favorites ?? 0;
  }
  return counts;
}

export async function setFavorite(
  db: SqlExecutor,
  id: string,
  favorite: boolean,
  now: string,
): Promise<void> {
  await db.run("UPDATE garments SET is_favorite = ?, updated_at = ? WHERE id = ?", [
    favorite ? 1 : 0,
    now,
    id,
  ]);
}

/** 고른 옷을 다른 칸으로 옮긴다. 칸 값과 고친 시각만 바꾼다. 바뀐 벌 수를 낸다. */
export async function moveGarments(
  db: SqlExecutor,
  ids: readonly string[],
  to: ClosetKey,
  now: string,
): Promise<number> {
  let moved = 0;
  for (const id of ids) {
    const result = await db.run(
      "UPDATE garments SET closet = ?, updated_at = ? WHERE id = ? AND closet <> ?",
      [to, now, id, to],
    );
    moved += result.changes;
  }
  return moved;
}

export interface GarmentFit {
  sizeLabel: Garment["sizeLabel"];
  measurements: Garment["measurements"];
  placement: Garment["placement"];
}

/** 옷 상세 「고치기」 → 「치수 고치기」 의 「저장」: 사이즈, 치수, 맞춘 자리만 바꾼다. */
export async function updateGarmentFit(
  db: SqlExecutor,
  id: string,
  fit: GarmentFit,
  now: string,
): Promise<void> {
  await db.run(
    "UPDATE garments SET size_label = ?, measurements = ?, placement_x = ?, placement_y = ?, placement_scale = ?, updated_at = ? WHERE id = ?",
    [
      fit.sizeLabel,
      JSON.stringify(fit.measurements),
      fit.placement?.x ?? null,
      fit.placement?.y ?? null,
      fit.placement?.scale ?? null,
      now,
      id,
    ],
  );
}

/** 옷 한 벌을 지운다. 넣은 길 행도 함께 지운다. 그림 파일은 부르는 쪽이 지운다. */
export async function deleteGarment(db: SqlExecutor, id: string): Promise<void> {
  await db.run("DELETE FROM garment_sources WHERE garment_id = ?", [id]);
  await db.run("DELETE FROM garments WHERE id = ?", [id]);
}

/** 「저장소 보기」 와 시험이 넣은 길을 확인할 때 쓴다. */
export async function readGarmentMethod(db: SqlExecutor, id: string): Promise<string | null> {
  const row = await db.get<{ method: string }>(
    "SELECT method FROM garment_sources WHERE garment_id = ?",
    [id],
  );
  return row?.method ?? null;
}

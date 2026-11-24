import { fixedClock } from "@nuno/clock/testing";
import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countCloset,
  createGarmentTables,
  insertGarment,
  listCloset,
  moveGarments,
  readGarmentMethod,
  setFavorite,
  type NewGarment,
} from "./garment-store";

let db: NodeSqliteDatabase;

beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createGarmentTables }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

const garment = (id: string, closet: NewGarment["closet"]): NewGarment => ({
  id,
  closet,
  category: "top",
  color: "brown",
  name: "브라운 상의",
  brand: null,
  seasons: ["fall"],
  priceKrw: null,
  linkUrl: null,
  sizeLabel: null,
  measurements: {},
  placement: null,
  cutoutSource: "fixture",
  maskEdited: false,
  originalPath: `garments/${id}/original.jpg`,
  cutoutPath: `garments/${id}/cutout.png`,
  thumbPath: `garments/${id}/thumb.png`,
  method: "album",
  hadPerson: false,
});

const NOW = fixedClock(new Date("2026-11-25T01:00:00.000Z")).now().toISOString();

describe("옷장 두 칸 표", () => {
  it("같은 옷 ID 로 담기를 다섯 번 해도 옷은 한 벌이고 넣은 길이 남는다", async () => {
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await db.transaction((tx) => insertGarment(tx, garment("g-1", "mine"), NOW)));
    }
    expect(results).toEqual([true, false, false, false, false]);
    expect(await db.all("SELECT id FROM garments")).toHaveLength(1);
    expect(await readGarmentMethod(db, "g-1")).toBe("album");
  });

  it("즐겨찾기는 칸마다 따로 세고, 옮기면 칸 수와 즐겨찾기 수가 함께 옮겨 간다", async () => {
    for (const id of ["m1", "m2", "m3"]) await insertGarment(db, garment(id, "mine"), NOW);
    for (const id of ["w1", "w2"]) await insertGarment(db, garment(id, "wanted"), NOW);
    for (const id of ["m1", "m2", "m3", "w1", "w2"]) await setFavorite(db, id, true, NOW);
    expect(await countCloset(db)).toEqual({
      mine: 3,
      wanted: 2,
      favorites: { mine: 3, wanted: 2 },
    });

    expect(await moveGarments(db, ["w1", "w2", "m1"], "mine", NOW)).toBe(2);
    expect(await countCloset(db)).toEqual({
      mine: 5,
      wanted: 0,
      favorites: { mine: 5, wanted: 0 },
    });
    expect((await listCloset(db, "mine")).map((item) => item.closet)).toEqual(
      Array(5).fill("mine"),
    );
  });
});

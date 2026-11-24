import { fixedClock } from "@nuno/clock/testing";
import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  addGarmentSampleKey,
  createGarmentTables,
  deleteGarment,
  insertGarment,
  listClosetSampleKeys,
  type NewGarment,
} from "./garment-store";

let db: NodeSqliteDatabase;
beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(
    db,
    [
      { version: 1, ...createGarmentTables },
      { version: 2, ...addGarmentSampleKey },
    ],
    { versionTable: "schema_migrations" },
  );
});
afterEach(() => db.close());

const NOW = fixedClock(new Date("2026-11-25T01:00:00.000Z")).now().toISOString();
const sample = (id: string, sampleKey?: string): NewGarment => ({
  id,
  closet: "wanted",
  category: "outer",
  color: "white",
  name: "아이보리 케이프 벨티드 코트",
  brand: null,
  seasons: [],
  priceKrw: null,
  linkUrl: null,
  sizeLabel: null,
  measurements: {},
  placement: null,
  cutoutSource: "fixture",
  maskEdited: false,
  originalPath: `garments/${id}/original.png`,
  cutoutPath: `garments/${id}/cutout.png`,
  thumbPath: `garments/${id}/thumb.png`,
  method: sampleKey ? "sample" : "album",
  hadPerson: false,
  sampleKey,
});

it("견본 옷으로 담은 옷의 견본 키는 옷이 남아 있는 동안만 「옷장에 있음」 으로 돌아온다", async () => {
  await insertGarment(db, sample("g1", "w18"), NOW);
  await insertGarment(db, sample("g2"), NOW);
  expect(await listClosetSampleKeys(db)).toEqual(["w18"]);
  await db.transaction((tx) => deleteGarment(tx, "g1"));
  expect(await listClosetSampleKeys(db)).toEqual([]);
});

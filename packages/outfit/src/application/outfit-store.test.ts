import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OutfitPiece } from "../domain";
import {
  createOutfitTables,
  deleteSavedOutfit,
  listSavedOutfits,
  readCurrentOutfit,
  removeGarmentFromOutfits,
  saveOutfitToSlot,
  writeCurrentOutfit,
} from "./outfit-store";

let db: NodeSqliteDatabase;
beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createOutfitTables }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

const NOW = "2026-11-25T02:00:00.000Z";
const coat: OutfitPiece = { ref: { kind: "garment", id: "g1" }, category: "outer", slot: "outer" };
const tights: OutfitPiece = {
  ref: { kind: "sample", key: "w49" },
  category: "acc",
  slot: "legwear",
};

describe("코디 표", () => {
  it("지금 입은 코디는 트윈마다 하나이고, 옷장 옷과 견본 옷을 순서대로 남긴다", async () => {
    expect(await readCurrentOutfit(db, "harin")).toBeNull();
    await writeCurrentOutfit(db, "harin", [coat, tights], "c1", NOW);
    await writeCurrentOutfit(db, "harin", [tights], "c2", NOW);
    expect(await readCurrentOutfit(db, "harin")).toEqual([tights]);
    expect(await db.all("SELECT id FROM outfits WHERE kind = 'current'")).toHaveLength(1);
  });

  it("내 코디 칸을 지우면 뒤 칸이 당겨지고, 옷장에서 지운 옷은 코디에서도 빠진다", async () => {
    for (const slot of [1, 2, 3]) {
      await saveOutfitToSlot(
        db,
        { id: `s${slot}`, slot, title: "11월 25일 코디", twinKey: "harin", outfit: [coat, tights] },
        NOW,
      );
    }
    await deleteSavedOutfit(db, "s1");
    expect((await listSavedOutfits(db)).map((s) => [s.id, s.slot])).toEqual([
      ["s2", 1],
      ["s3", 2],
    ]);
    await removeGarmentFromOutfits(db, "g1");
    expect((await listSavedOutfits(db))[0]?.outfit).toEqual([tights]);
  });
});

import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Look } from "../domain";
import { createLookTables, insertLook, listLooks } from "./look-store";

let db: NodeSqliteDatabase;
beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createLookTables }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

const look: Look = {
  id: "L1",
  title: "첫 코디",
  twinKey: "harin",
  photoKey: "harin_w18_w14",
  createdAt: "2026-11-25T01:00:00.000Z",
  items: [
    { sampleKey: "w18", category: "outer", slot: "outer", name: "아이보리 케이프 벨티드 코트" },
    { sampleKey: "w14", category: "bottom", slot: "bottom", name: "화이트 코튼 미니스커트" },
  ],
};

describe("룩 표", () => {
  it("같은 ID 를 다섯 번 넣어도 룩은 한 장이고, 입은 옷은 넣은 차례대로 돌아온다", async () => {
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await insertLook(db, look));
    expect(results).toEqual([true, false, false, false, false]);
    expect(await listLooks(db)).toEqual([look]);
  });
});

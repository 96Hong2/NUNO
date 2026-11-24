import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chooseTwin,
  createTwinChoiceTable,
  currentTwin,
  readTwinChoice,
} from "./twin-choice-store";

let db: NodeSqliteDatabase;

beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createTwinChoiceTable }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

describe("고른 트윈 표", () => {
  it("고르기 전에는 비어 있고 홈은 기본 트윈 하린을 세운다", async () => {
    expect(await readTwinChoice(db)).toBeNull();
    expect(await currentTwin(db)).toBe("harin");
  });

  it("다시 고르면 한 줄을 덮어쓴다", async () => {
    await chooseTwin(db, "harin");
    await chooseTwin(db, "serin");
    expect(await readTwinChoice(db)).toBe("serin");
    expect(await db.all("SELECT * FROM twin_choice")).toHaveLength(1);
  });
});

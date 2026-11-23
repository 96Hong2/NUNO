import { afterEach, describe, expect, it } from "vitest";
import type { Migration } from "../domain";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "../testing";
import { runMigrations } from "./run-migrations";

// 시험 안에서만 쓰는 가짜 판. 실제 판 사슬은 T2-1 에서 앱 composition 이 정한다.
const createNotes: Migration = {
  version: 1,
  name: "create-notes",
  up: (tx) => tx.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)"),
};
const addNoteTag: Migration = {
  version: 2,
  name: "add-note-tag",
  up: (tx) => tx.exec("ALTER TABLE notes ADD COLUMN tag TEXT"),
};
const createTags: Migration = {
  version: 3,
  name: "create-tags",
  up: (tx) => tx.exec("CREATE TABLE tags (name TEXT PRIMARY KEY)"),
};

const options = { versionTable: "probe_versions" };
let db: NodeSqliteDatabase;

afterEach(() => db.close());

const tableNames = async () =>
  (
    await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
  ).map((row) => row.name);

describe("runMigrations", () => {
  it("빈 DB 에 판을 차례로 적용하고 인자로 받은 표에 판 번호를 적는다", async () => {
    db = openNodeSqliteDatabase();
    const report = await runMigrations(db, [createNotes, addNoteTag], options);

    expect(report).toEqual({ from: 0, to: 2, applied: [1, 2] });
    expect(await tableNames()).toEqual(["notes", "probe_versions"]);
    expect(await db.all("SELECT version, name FROM probe_versions ORDER BY version")).toEqual([
      { version: 1, name: "create-notes" },
      { version: 2, name: "add-note-tag" },
    ]);
    await db.run("INSERT INTO notes (id, body, tag) VALUES (?, ?, ?)", ["n1", "본문", "t"]);
  });

  it("다시 돌리면 아무것도 하지 않고, 새 판만 더한다", async () => {
    db = openNodeSqliteDatabase();
    await runMigrations(db, [createNotes, addNoteTag], options);

    expect(await runMigrations(db, [createNotes, addNoteTag], options)).toEqual({
      from: 2,
      to: 2,
      applied: [],
    });
    expect(await runMigrations(db, [createNotes, addNoteTag, createTags], options)).toEqual({
      from: 2,
      to: 3,
      applied: [3],
    });
  });

  it("실패한 판은 단계와 판 번호 기록을 함께 되돌리고 오류를 다시 던진다", async () => {
    db = openNodeSqliteDatabase();
    const broken: Migration = {
      version: 2,
      name: "broken",
      up: async (tx) => {
        await tx.exec("CREATE TABLE half_done (id TEXT)");
        throw new Error("판 2 실패");
      },
    };

    await expect(runMigrations(db, [createNotes, broken], options)).rejects.toThrow("판 2 실패");
    expect(await tableNames()).toEqual(["notes", "probe_versions"]);
    expect(await db.get("SELECT MAX(version) AS version FROM probe_versions")).toEqual({
      version: 1,
    });
  });

  it("기기 판이 앱이 아는 판보다 높으면 아무것도 적용하지 않고 던진다", async () => {
    db = openNodeSqliteDatabase();
    await runMigrations(db, [createNotes, addNoteTag], options);

    await expect(runMigrations(db, [createNotes], options)).rejects.toThrow(/앱을 새 판으로/);
  });

  it("판 번호 표 이름이 SQL 이름이 아니면 DB 를 건드리지 않고 던진다", async () => {
    db = openNodeSqliteDatabase();
    await expect(
      runMigrations(db, [createNotes], { versionTable: "x; DROP TABLE notes" }),
    ).rejects.toThrow(RangeError);
    expect(await tableNames()).toEqual([]);
  });

  it("트랜잭션이 도는 동안 밖에서 부른 쓰기는 기다렸다가 따로 남는다", async () => {
    db = openNodeSqliteDatabase();
    await db.exec("CREATE TABLE log (line TEXT NOT NULL)");

    const failing = db.transaction(async (tx) => {
      await tx.run("INSERT INTO log (line) VALUES ('안')");
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("되돌림");
    });
    const outside = db.run("INSERT INTO log (line) VALUES ('밖')");

    await expect(failing).rejects.toThrow("되돌림");
    await outside;
    expect(await db.all("SELECT line FROM log")).toEqual([{ line: "밖" }]);
  });
});

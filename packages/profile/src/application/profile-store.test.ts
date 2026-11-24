import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProfileTable, readProfile, saveBirthDate } from "./profile-store";

let db: NodeSqliteDatabase;

beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createProfileTable }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

describe("profile 표", () => {
  it("옮긴 직후에는 빈 프로필 한 줄이 있다", async () => {
    expect(await readProfile(db)).toEqual({
      birthDate: null,
      displayName: null,
      styleTags: [],
      onboardingDone: false,
      tourSeen: false,
    });
  });

  it("생년월일은 받을 수 있는 날짜만 저장한다", async () => {
    await expect(saveBirthDate(db, "2026-11-25", "2026-11-24")).rejects.toThrow();
    expect((await readProfile(db)).birthDate).toBeNull();
    await saveBirthDate(db, "2002-03-14", "2026-11-24");
    expect((await readProfile(db)).birthDate).toBe("2002-03-14");
  });
});

import { describe, expect, it } from "vitest";
import { assertSqlIdentifier, pendingMigrations, type Migration } from "./migration";

const step = (version: number): Migration => ({
  version,
  name: `step-${version}`,
  up: () => Promise.resolve(),
});

describe("pendingMigrations", () => {
  it("지금 판 다음 단계만 차례로 낸다", () => {
    const chain = [step(1), step(2), step(3)];
    expect(pendingMigrations(chain, 0).map((m) => m.version)).toEqual([1, 2, 3]);
    expect(pendingMigrations(chain, 2).map((m) => m.version)).toEqual([3]);
    expect(pendingMigrations(chain, 3)).toEqual([]);
  });

  it("판 번호가 1 부터 이어지지 않으면 던진다", () => {
    expect(() => pendingMigrations([step(1), step(3)], 0)).toThrow(RangeError);
    expect(() => pendingMigrations([step(2)], 0)).toThrow(RangeError);
    expect(() => pendingMigrations([step(1), step(1)], 0)).toThrow(RangeError);
  });

  it("기기 판이 앱이 아는 마지막 판보다 높으면 던진다", () => {
    expect(() => pendingMigrations([step(1)], 2)).toThrow(/앱을 최신 버전으로 업데이트해 주세요/);
  });
});

describe("assertSqlIdentifier", () => {
  it("영문자, 숫자, _ 가 아닌 표 이름을 막는다", () => {
    expect(() => assertSqlIdentifier("schema_migrations")).not.toThrow();
    for (const name of ["", "1table", "a-b", "t; DROP TABLE x", "표"]) {
      expect(() => assertSqlIdentifier(name)).toThrow(RangeError);
    }
  });
});

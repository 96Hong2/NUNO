import { describe, expect, it } from "vitest";
import { BIRTH_DATE_DEFAULT, isValidBirthDate } from "./birth-date";

const TODAY = "2026-11-24";

describe("isValidBirthDate", () => {
  it("처음 값과 범위 양 끝은 받는다", () => {
    expect(isValidBirthDate(BIRTH_DATE_DEFAULT, TODAY)).toBe(true);
    expect(isValidBirthDate("1900-01-01", TODAY)).toBe(true);
    expect(isValidBirthDate(TODAY, TODAY)).toBe(true);
  });

  it("없는 날짜와 범위 밖, 형식이 다른 값은 받지 않는다", () => {
    expect(isValidBirthDate("2023-02-29", TODAY)).toBe(false);
    expect(isValidBirthDate("2024-02-29", TODAY)).toBe(true);
    expect(isValidBirthDate("2002-04-31", TODAY)).toBe(false);
    expect(isValidBirthDate("1899-12-31", TODAY)).toBe(false);
    expect(isValidBirthDate("2026-11-25", TODAY)).toBe(false);
    expect(isValidBirthDate("", TODAY)).toBe(false);
    expect(isValidBirthDate("2002-3-14", TODAY)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isPresetTwinKey, PRESET_TWIN_KEYS } from "./preset-twin-key";

describe("isPresetTwinKey", () => {
  it("프리셋 여섯 키를 모두 받는다", () => {
    for (const key of ["yuna", "harin", "serin", "moa", "lulu", "noel"]) {
      expect(isPresetTwinKey(key)).toBe(true);
    }
  });

  it("프리셋은 여섯뿐이다", () => {
    expect(PRESET_TWIN_KEYS).toHaveLength(6);
  });

  it("대소문자가 다르거나 없는 키는 받지 않는다", () => {
    for (const value of ["Yuna", "haerin", "", " yuna", null, undefined, 1]) {
      expect(isPresetTwinKey(value)).toBe(false);
    }
  });
});

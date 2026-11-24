import { describe, expect, it } from "vitest";
import { normalizeDisplayName } from "./display-name";
import { STYLE_TAGS, toggleStyleTag } from "./style-tags";

describe("normalizeDisplayName", () => {
  it("앞뒤 공백을 빼고 1~20자만 받는다", () => {
    expect(normalizeDisplayName("  은하  ")).toBe("은하");
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName("가".repeat(20))).toBe("가".repeat(20));
    expect(normalizeDisplayName("가".repeat(21))).toBeNull();
    expect(normalizeDisplayName("🙂".repeat(20))).toBe("🙂".repeat(20));
  });
});

describe("toggleStyleTag", () => {
  const five = STYLE_TAGS.slice(0, 5);

  it("다섯 개까지 고르고 여섯째는 막는다", () => {
    expect(toggleStyleTag(five.slice(0, 4), STYLE_TAGS[4])).toEqual({
      ok: true,
      selected: [...five],
    });
    expect(toggleStyleTag(five, STYLE_TAGS[5])).toEqual({ ok: false, reason: "max" });
  });

  it("고른 태그를 다시 누르면 풀고, 목록에 없는 태그는 막는다", () => {
    expect(toggleStyleTag(five, STYLE_TAGS[0])).toEqual({ ok: true, selected: five.slice(1) });
    expect(toggleStyleTag([], "없는태그")).toEqual({ ok: false, reason: "unknown" });
  });
});

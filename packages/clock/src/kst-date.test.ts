import { describe, expect, it } from "vitest";
import { fixedClock } from "./testing";
import { toKstDateString } from "./kst-date";

describe("toKstDateString", () => {
  it("UTC 15시 전이면 같은 날짜다", () => {
    expect(toKstDateString(new Date("2026-11-24T14:59:59.999Z"))).toBe("2026-11-24");
  });

  it("UTC 15시부터는 한국 날짜가 다음 날이다", () => {
    expect(toKstDateString(new Date("2026-11-24T15:00:00.000Z"))).toBe("2026-11-25");
  });

  it("해가 바뀌는 순간도 한국 날짜로 센다", () => {
    expect(toKstDateString(new Date("2026-12-31T15:00:00.000Z"))).toBe("2027-01-01");
  });

  it("고정 시계의 시각을 그대로 받는다", () => {
    const clock = fixedClock("2026-11-23T20:00:00.000Z");
    expect(toKstDateString(clock.now())).toBe("2026-11-24");
  });

  it("유효하지 않은 시각은 받지 않는다", () => {
    expect(() => toKstDateString(new Date("not a date"))).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import {
  closetFilter,
  closetFilterCount,
  countLooksByGarment,
  lookUseLabel,
  NO_CLOSET_FILTER,
} from "./closet-filter";
import type { Season } from "./garment-attributes";

const garment = (id: string, isFavorite: boolean, seasons: Season[]) => ({
  id,
  isFavorite,
  seasons,
});

const coat = garment("coat", true, ["fall", "winter"]);
const knit = garment("knit", false, ["winter"]);
const skirt = garment("skirt", true, []);
const all = [coat, knit, skirt];

describe("옷장 거르기", () => {
  it("아무 조건도 켜지 않으면 모든 옷이 순서대로 남고 「거르기」 에 수가 붙지 않는다", () => {
    expect(closetFilter(all, NO_CLOSET_FILTER, {})).toEqual(all);
    expect(closetFilterCount(NO_CLOSET_FILTER)).toBe(0);
  });

  it("「즐겨찾기」 를 켜면 별을 누른 옷만 남고 「거르기 1」 이다", () => {
    const filter = { ...NO_CLOSET_FILTER, favoriteOnly: true };
    expect(closetFilter(all, filter, {})).toEqual([coat, skirt]);
    expect(closetFilterCount(filter)).toBe(1);
  });

  it("「룩에 안 쓴 옷」 은 룩 수가 0 이거나 룩 수를 모르는 옷만 남긴다", () => {
    const filter = { ...NO_CLOSET_FILTER, unusedOnly: true };
    expect(closetFilter(all, filter, { coat: 2, knit: 0 })).toEqual([knit, skirt]);
  });

  it("계절을 여러 개 고르면 그 가운데 하나라도 든 옷만 남고, 계절을 적지 않은 옷은 빠진다", () => {
    const filter = { ...NO_CLOSET_FILTER, seasons: ["fall", "summer"] as Season[] };
    expect(closetFilter(all, filter, {})).toEqual([coat]);
  });

  it("조건을 함께 켜면 모두 맞는 옷만 남고, 계절은 몇 개를 골라도 한 줄로 센다", () => {
    const filter = {
      favoriteOnly: true,
      unusedOnly: true,
      seasons: ["winter", "spring"] as Season[],
    };
    expect(closetFilter(all, filter, { knit: 1 })).toEqual([coat]);
    expect(closetFilter(all, filter, { coat: 1 })).toEqual([]);
    expect(closetFilterCount(filter)).toBe(3);
  });
});

describe("옷별 룩 수", () => {
  it("옷마다 그 옷을 입은 룩 수를 세고, 한 룩에 같은 옷이 두 번 있어도 한 번만 센다", () => {
    expect(countLooksByGarment([["coat", "knit"], ["coat", "coat"], ["skirt"], []])).toEqual({
      coat: 2,
      knit: 1,
      skirt: 1,
    });
  });

  it("「내 옷」 카드 줄은 룩 수가 있으면 「룩 N개에 썼어요」, 없으면 「아직 룩에 안 썼어요」 다", () => {
    expect(lookUseLabel(8)).toBe("룩 8개에 썼어요");
    expect(lookUseLabel(1)).toBe("룩 1개에 썼어요");
    expect(lookUseLabel(0)).toBe("아직 룩에 안 썼어요");
  });
});

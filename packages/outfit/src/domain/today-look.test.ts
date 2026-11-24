import { describe, expect, it } from "vitest";
import { defaultOutfit, RECOMMENDED_LOOKS, samplePiece, twinTodayLook } from "./samples";
import { sameOutfit } from "./outfit";

describe("오늘 룩", () => {
  it("하린은 「케이프 트렌치와 롱부츠」 이고, 어느 트윈도 기본 코디를 오늘 룩으로 고르지 않는다", () => {
    expect(twinTodayLook("harin")?.name).toBe("케이프 트렌치와 롱부츠");
    const sameAsDefault = Object.keys(RECOMMENDED_LOOKS).filter((twin) =>
      sameOutfit((twinTodayLook(twin)?.items ?? []).map(samplePiece), defaultOutfit(twin)),
    );
    expect(sameAsDefault).toEqual([]);
  });
});

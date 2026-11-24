import { describe, expect, it } from "vitest";
import { savedAgoLabel } from "./look";
import { closetSavedMessage, wornSheetState } from "./worn-sheet";

describe("룩 카드 저장 시점 글", () => {
  // 2026-11-25 10:00 한국 시각(01:00 UTC)
  const now = new Date("2026-11-25T01:00:00.000Z");
  it("한 시간 안이면 「방금 저장」, 같은 한국 날짜면 「오늘 저장」, 그 밖에는 한국 날짜 차이로 「N일 전 저장」", () => {
    expect(savedAgoLabel("2026-11-25T00:30:00.000Z", now)).toBe("방금 저장");
    expect(savedAgoLabel("2026-11-24T15:30:00.000Z", now)).toBe("오늘 저장");
    // UTC 로는 같은 날이지만 한국 날짜로는 전날(11-24 23:00 KST)
    expect(savedAgoLabel("2026-11-24T14:00:00.000Z", now)).toBe("1일 전 저장");
    expect(savedAgoLabel("2026-11-21T01:00:00.000Z", now)).toBe("4일 전 저장");
  });
});

describe("입은 옷 시트", () => {
  it("고른 수와 옷장에 없는 수로 안내 줄과 두 단추가 정해진다", () => {
    expect(wornSheetState(0, 0)).toEqual({
      line: "옷을 골라 한꺼번에 입혀 보거나 옷장에 담아요",
      closet: { label: "옷장에 담기", active: false },
      wear: { label: "트윈에 입혀 보기", active: false },
    });
    expect(wornSheetState(2, 1)).toMatchObject({
      line: "2벌 골랐어요",
      closet: { label: "옷장에 담기 1", active: true },
      wear: { label: "트윈에 입혀 보기 2", active: true },
    });
    expect(wornSheetState(2, 0).closet).toEqual({ label: "모두 옷장에 있어요", active: false });
  });

  it("담은 뒤 알림은 이미 있는 옷이 없으면 뒤 문장을 붙이지 않는다", () => {
    expect(closetSavedMessage(1, 1)).toBe("1벌을 옷장에 담았어요. 1벌은 이미 있어요");
    expect(closetSavedMessage(2, 0)).toBe("2벌을 옷장에 담았어요");
  });
});

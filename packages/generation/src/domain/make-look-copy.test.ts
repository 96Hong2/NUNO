import { describe, expect, it } from "vitest";
import {
  freeLooksNow,
  lookFailureCopy,
  makeLookSheetView,
  makingCopy,
  stageButtonNote,
} from "./generation";

// 기대값은 개선 시안 명세 5(완성 룩 만들기 시트와 결과)와 명세 2(「이대로 입히기」 상태)에서 가져온다.

/** 시트와 만드는 중 화면에 남으면 안 되는 글: 장 종류 표기와 실패를 미리 알리는 문장 */
const FORBIDDEN = [/앞 ?1장/, /앞모습/, /돌려드려요/, /만들지 못하면/, /중 1장을 써요/];

const textsOf = (value: object): string[] =>
  Object.values(value).flatMap((item: unknown) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object") return textsOf(item);
    return [];
  });

describe("무대 「이대로 입히기」 옆 글", () => {
  it("무료 장이 남았으면 「무료 N장 남음」, 다 썼으면 「1장 4골드」 다", () => {
    expect(stageButtonNote(2)).toBe("무료 2장 남음");
    expect(stageButtonNote(1)).toBe("무료 1장 남음");
    expect(stageButtonNote(0)).toBe("1장 4골드");
  });

  it("무료 장이 남아도 오늘 무료 한도에 닿았으면 「1장 4골드」 다", () => {
    expect(stageButtonNote(freeLooksNow(2, false))).toBe("1장 4골드");
  });
});

describe("「완성 룩 만들기」 시트 세 상태", () => {
  it("무료 상태는 줄 그은 4골드와 「무료」, 남은 사진 수 줄, 「무료로 만들기」 다", () => {
    expect(makeLookSheetView(2, 2, 0)).toEqual({
      kind: "free",
      listPrice: "4골드",
      price: "무료",
      note: "무료로 만들 수 있는 사진이 2장 남았어요",
      button: "무료로 만들기",
      payWith: "trial",
    });
    expect(makeLookSheetView(1, 1, 0)).toMatchObject({
      note: "무료로 만들 수 있는 사진이 1장 남았어요",
    });
  });

  it("골드 상태는 「4골드」, 「400원」, 「내 골드 24골드」, 「4골드 사용」 이다", () => {
    expect(makeLookSheetView(0, 0, 24)).toEqual({
      kind: "gold",
      price: "4골드",
      won: "400원",
      notice: null,
      balance: { label: "내 골드", value: "24골드" },
      button: "4골드 사용",
      payWith: "gold",
    });
  });

  it("골드가 딱 4골드면 골드 상태, 2골드면 골드 부족 세 줄 표다", () => {
    expect(makeLookSheetView(0, 0, 4).kind).toBe("gold");
    expect(makeLookSheetView(0, 0, 2)).toEqual({
      kind: "short",
      price: "4골드",
      notice: null,
      rows: [
        { label: "필요한 골드", value: "4골드" },
        { label: "내 골드", value: "2골드" },
        { label: "부족한 골드", value: "2골드" },
      ],
    });
  });

  it("무료 장이 남았는데 오늘 무료 한도에 닿았으면 골드 상태에 「오늘은 무료로 더 만들 수 없어요」 를 둔다", () => {
    const view = makeLookSheetView(freeLooksNow(2, false), 2, 20);
    expect(view.kind).toBe("gold");
    expect(view).toMatchObject({ notice: "오늘은 무료로 더 만들 수 없어요" });
  });

  it("어느 상태에도 장 종류 표기와 「만들지 못하면 …돌려드려요」 가 없다", () => {
    for (const view of [
      makeLookSheetView(2, 2, 0),
      makeLookSheetView(0, 0, 24),
      makeLookSheetView(0, 2, 1),
    ]) {
      for (const text of textsOf(view)) {
        for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
      }
    }
  });
});

describe("만드는 중 화면 글", () => {
  it("단계와 상관없이 「완성 룩을 만들고 있어요」 와 닫기 안내 한 줄이고, 막대는 3분의 1씩 찬다", () => {
    expect(makingCopy("queued")).toEqual({
      percent: 33,
      title: "완성 룩을 만들고 있어요",
      note: "화면을 닫아도 계속 만들어요. 다 되면 알림을 보내 드려요",
    });
    expect(makingCopy("generating").percent).toBe(67);
    expect(makingCopy("checking").percent).toBe(100);
    for (const text of textsOf(makingCopy("generating"))) {
      for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
    }
  });
});

describe("「만들지 못했어요」 화면 글", () => {
  it("골드, 시스템 오류: 골드를 돌려준 제목과 「같은 코디로 다시 만들기」", () => {
    expect(lookFailureCopy("gold", "provider_error", 4)).toEqual({
      headline: "만들지 못했어요.",
      title: "골드를 돌려드렸어요",
      body: "이미지를 만드는 중에 오류가 났어요",
      refund: { label: "돌려받은 골드", value: "+4골드" },
      action: "retry",
      actionLabel: "같은 코디로 다시 만들기",
    });
  });

  it("골드, 안전 기준: 「안전 기준을 통과하지 못했어요」 와 「코디 바꾸기」", () => {
    expect(lookFailureCopy("gold", "provider_refused", 4)).toMatchObject({
      title: "골드를 돌려드렸어요",
      body: "안전 기준을 통과하지 못했어요",
      refund: { label: "돌려받은 골드", value: "+4골드" },
      action: "change",
      actionLabel: "코디 바꾸기",
    });
  });

  it("무료 장, 시스템 오류: 무료 1장을 돌려준 제목과 「돌려받은 무료 장 +1장」", () => {
    expect(lookFailureCopy("trial", "provider_timeout", 0)).toEqual({
      headline: "만들지 못했어요.",
      title: "무료 1장을 돌려드렸어요",
      body: "이미지를 만드는 중에 오류가 났어요",
      refund: { label: "돌려받은 무료 장", value: "+1장" },
      action: "retry",
      actionLabel: "같은 코디로 다시 만들기",
    });
  });

  it("무료 장, 안전 기준: 「코디 바꾸기」", () => {
    expect(lookFailureCopy("trial", "provider_refused", 0)).toMatchObject({
      title: "무료 1장을 돌려드렸어요",
      body: "안전 기준을 통과하지 못했어요",
      refund: { label: "돌려받은 무료 장", value: "+1장" },
      action: "change",
      actionLabel: "코디 바꾸기",
    });
  });
});

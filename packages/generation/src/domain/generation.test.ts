import { describe, expect, it } from "vitest";
import {
  freeLooksNow,
  goldConfirmCopy,
  ledgerDateLabel,
  mayHaveBeenAccepted,
  payWithFor,
  progressStep,
  stagePriceLabel,
} from "./generation";

describe("「이대로 입히기」 화면 글자", () => {
  it("만드는 중 단계는 작업 상태로 고른다", () => {
    expect(progressStep("queued")).toEqual({ percent: 33, label: "옷을 입히고 있어요" });
    expect(progressStep("generating")).toEqual({ percent: 67, label: "앞모습을 그리고 있어요" });
    expect(progressStep("checking")).toEqual({ percent: 100, label: "다 됐어요" });
    expect(progressStep("succeeded")).toEqual({ percent: 100, label: "다 됐어요" });
  });

  it("무대 단추는 무료 장이 있으면 남은 장 수, 없으면 4골드다", () => {
    expect(stagePriceLabel(2)).toBe("무료 2장 남음");
    expect(stagePriceLabel(0)).toBe("4골드");
  });

  it("무료 장이 남아도 오늘 무료 접수가 한도에 닿았으면 무대 단추와 결제는 골드다", () => {
    expect(stagePriceLabel(freeLooksNow(2, false))).toBe("4골드");
    expect(payWithFor(freeLooksNow(2, false))).toBe("gold");
    expect(payWithFor(freeLooksNow(1, true))).toBe("trial");
  });

  it("골드가 모자라면 모자란 양을 적는다", () => {
    expect(goldConfirmCopy(24)).toMatchObject({ balanceLine: "24 → 20골드", short: false });
    expect(goldConfirmCopy(2)).toMatchObject({ balanceLine: "2골드, 2골드 모자라요", short: true });
    expect(goldConfirmCopy(20, 0).lead).toBe("첫 체험 무료를 다 썼어요. 골드로 만들어요");
    expect(goldConfirmCopy(20, 2).lead).toBe("오늘은 무료로 더 만들 수 없어요. 골드로 만들어요");
  });

  it("내역 날짜는 한국 날짜다", () => {
    // 2026-11-24 23:30 UTC 는 한국으로 11월 25일 아침이다.
    expect(ledgerDateLabel("2026-11-24T23:30:00.000Z")).toBe("11.25");
  });
});

describe("접수 응답을 받았는지 모를 때", () => {
  it("닿지 못했거나 서버 오류면 줄을 남기고, 4xx 와 서버가 일부러 준 거절 코드면 지운다", () => {
    expect(mayHaveBeenAccepted(0, "network")).toBe(true);
    expect(mayHaveBeenAccepted(500, "http_500")).toBe(true);
    expect(mayHaveBeenAccepted(502, "bad_gateway")).toBe(true);
    expect(mayHaveBeenAccepted(503, "switch_off")).toBe(false);
    expect(mayHaveBeenAccepted(402, "insufficient_gold")).toBe(false);
    expect(mayHaveBeenAccepted(409, "payment_changed")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { goldConfirmCopy, ledgerDateLabel, progressStep, stagePriceLabel } from "./generation";

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

  it("골드가 모자라면 모자란 양을 적는다", () => {
    expect(goldConfirmCopy(24)).toEqual({ balanceLine: "24 → 20골드", short: false });
    expect(goldConfirmCopy(2)).toEqual({ balanceLine: "2골드, 2골드 모자라요", short: true });
  });

  it("내역 날짜는 한국 날짜다", () => {
    // 2026-11-24 23:30 UTC 는 한국으로 11월 25일 아침이다.
    expect(ledgerDateLabel("2026-11-24T23:30:00.000Z")).toBe("11.25");
  });
});

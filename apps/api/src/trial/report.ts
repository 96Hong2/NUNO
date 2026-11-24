import type { CsvRow } from "./csv.ts";
import type { TrialModel } from "./run-trial.ts";

// 채점을 마친 뒤 호출 장부(calls.csv: 모델, 청구액, 응답 시간)와 채점 CSV(판정)를 이어 모델마다 숫자를 낸다.
// 원가 식은 기술 검토 v3 4절: (청구 총액 + 자동 검사 비용 x 호출 수) / 정상 수 + 기타 비용.

/** 1달러 원화. 기술 검토 v3 가 쓴 값이다 */
export const KRW_PER_USD = 1400;
/** 호출 한 번의 자동 검사 비용(원). 실측 전 계획 값이다 */
export const CHECK_KRW_PER_CALL = 4.2;
/** 정상 사진 한 장의 저장, 전송, 서버 값(원). 계획 값이다 */
export const OTHER_KRW_PER_PHOTO = 15;
/** 바깥 평가자와 기획자 판정이 같은 장이 이 수보다 적으면 채점표를 고쳐 다시 채점한다(40장 기준) */
export const MIN_AGREEMENT = 32;

export interface ModelReport {
  model: TrialModel;
  calls: number;
  blocked: number;
  timedOut: number;
  errors: number;
  scored: number;
  normal: number;
  /** 채점한 장 가운데 정상 비율(처음 만든 장, 다시 만든 장) */
  p1: number | null;
  p2: number | null;
  /**
   * 부른 호출 가운데 정상 사진을 받은 비율(거절, 무응답, 오류를 분모에 넣음).
   * 최종 전달 비율 1 - (1 - p1)(1 - p2) 에 어느 쪽을 쓸지는 기획자가 정한다. 둘 다 낸다
   */
  p1Calls: number | null;
  p2Calls: number | null;
  costUsd: number;
  /** 청구액이 비어 있는 호출 수(거절 과금 미확인 등). 0 이 아니면 원가가 작게 나온다 */
  costMissing: number;
  /** 정상 사진당 원가(원). 정상이 0장이면 null */
  krwPerNormal: number | null;
  p95Ms: number | null;
  /** 트윈 종류, 옷 출처, 품목 수별 정상 수(D8) */
  normalBy: Record<string, number>;
}

/** 요청 ID 마다 마지막 줄(결과 줄)만 남긴다 */
function lastRowPerRequest(calls: readonly CsvRow[]): CsvRow[] {
  const byId = new Map<string, CsvRow>();
  for (const row of calls) byId.set(row.request_id ?? "", row);
  return [...byId.values()];
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null;
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const yn = (value: string | undefined) => (value ?? "").trim().toLowerCase();

/**
 * 한 장의 최종 판정. 바깥 평가자 둘이 다 채웠으면 셋 가운데 둘 이상이 불합격(n)일 때 정상이 아니다.
 * 아니면 기획자 판정(normal)을 쓴다. 비어 있으면 아직 채점하지 않은 장이다.
 */
export function finalJudgement(row: CsvRow): "y" | "n" | "" {
  const planner = yn(row.normal);
  const outside = [yn(row.outside_1), yn(row.outside_2)];
  if (!["y", "n"].includes(planner)) return "";
  if (outside.every((value) => ["y", "n"].includes(value))) {
    const fails = [planner, ...outside].filter((value) => value === "n").length;
    return fails >= 2 ? "n" : "y";
  }
  return planner as "y" | "n";
}

/** set 으로 고른 세트(기본 선택 세트)만 센다. 원가는 그 세트에 쓴 호출만 집계한다 */
export function buildReport(
  calls: readonly CsvRow[],
  scoring: readonly CsvRow[],
  set = "select",
): ModelReport[] {
  const judgementOf = new Map(scoring.map((row) => [row.file ?? "", finalJudgement(row)]));
  const rows = lastRowPerRequest(calls).filter((row) => row.set === set);
  const models = [...new Set(rows.map((row) => row.model as TrialModel))].sort();
  return models.map((model) => {
    const mine = rows.filter((row) => row.model === model);
    const judged = (row: CsvRow) => judgementOf.get(row.file ?? "") ?? "";
    const isNormal = (row: CsvRow) => judged(row) === "y";
    const scored = mine.filter((row) => judged(row) !== "");
    const normal = mine.filter(isNormal);
    const first = scored.filter((row) => row.attempt === "1");
    const second = scored.filter((row) => row.attempt === "2");
    const callsOf = (attempt: string) => mine.filter((row) => row.attempt === attempt);
    const costUsd = mine.reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
    const totalKrw = costUsd * KRW_PER_USD + CHECK_KRW_PER_CALL * mine.length;
    const normalBy: Record<string, number> = {};
    for (const row of normal) {
      for (const key of [
        `twin_kind=${row.twin_kind}`,
        `garment_source=${row.garment_source}`,
        `items=${row.items}`,
      ]) {
        normalBy[key] = (normalBy[key] ?? 0) + 1;
      }
    }
    return {
      model,
      calls: mine.length,
      blocked: mine.filter((row) => row.status === "refused").length,
      timedOut: mine.filter((row) => row.status === "timed_out").length,
      errors: mine.filter((row) => ["error", "calling", "unusable"].includes(row.status ?? ""))
        .length,
      scored: scored.length,
      normal: normal.length,
      p1: ratio(first.filter(isNormal).length, first.length),
      p2: ratio(second.filter(isNormal).length, second.length),
      p1Calls: ratio(callsOf("1").filter(isNormal).length, callsOf("1").length),
      p2Calls: ratio(callsOf("2").filter(isNormal).length, callsOf("2").length),
      costUsd,
      costMissing: mine.filter((row) => row.cost_usd === "" && row.status !== "timed_out").length,
      krwPerNormal: normal.length === 0 ? null : totalKrw / normal.length + OTHER_KRW_PER_PHOTO,
      p95Ms: percentile95(
        mine
          .map((row) => Number(row.elapsed_ms))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
      normalBy,
    };
  });
}

/** 바깥 평가자마다 기획자와 판정이 같은 장 수(outside_sample 표시 장만) */
export function outsideAgreement(scoring: readonly CsvRow[]): {
  sample: number;
  agree: [number, number];
} {
  const sample = scoring.filter((row) => yn(row.outside_sample) === "y");
  const agree = (column: "outside_1" | "outside_2") =>
    sample.filter((row) => yn(row.normal) !== "" && yn(row.normal) === yn(row[column])).length;
  return { sample: sample.length, agree: [agree("outside_1"), agree("outside_2")] };
}

export function formatReport(reports: readonly ModelReport[], set: string): string {
  const pct = (value: number | null) =>
    value === null ? "-" : `${Math.round(value * 1000) / 10}%`;
  const lines = reports.map((r) =>
    [
      `[${r.model}] ${set} 호출 ${r.calls}, 차단 ${r.blocked}, 무응답 ${r.timedOut}, 오류와 끊김 ${r.errors}, 채점 ${r.scored}, 정상 ${r.normal}`,
      `  채점 기준 p1 ${pct(r.p1)}, p2 ${pct(r.p2)}, 호출 기준 p1 ${pct(r.p1Calls)}, p2 ${pct(r.p2Calls)}`,
      `  청구 ${r.costUsd.toFixed(2)} USD(청구액 빈 호출 ${r.costMissing}), 정상 사진당 ${r.krwPerNormal === null ? "-" : `${Math.round(r.krwPerNormal)}원`}, 응답 p95 ${r.p95Ms ?? "-"}ms`,
      `  정상 수: ${
        Object.entries(r.normalBy)
          .map(([key, count]) => `${key} ${count}`)
          .join(", ") || "-"
      }`,
    ].join("\n"),
  );
  return lines.join("\n") || `${set} 세트 호출이 없다`;
}

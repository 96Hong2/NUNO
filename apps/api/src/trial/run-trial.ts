import {
  callProvider,
  type GenerationProvider,
  type ProviderOutcome,
} from "../generation/provider.ts";
import { csvHeader, csvLine, parseCsv, type CsvRow } from "./csv.ts";
import { stripMetadata, type ImageKind } from "./strip-metadata.ts";

// 반증 실험 호출 스크립트의 본체. 요청 목록을 부르고 결과를 채점 폴더와 호출 장부로 나눠 남긴다.
// 채점 폴더(scoring/)에는 모델을 가린 그림과 채점 CSV 만 둔다.
// 모델, 공급사, 청구액, 응답 시간, 차단 사유는 채점 폴더 밖의 호출 장부(calls.csv)에만 둔다.

/**
 * 반증 실험 모델. 셋째 자리는 차단 시험 전용 GPT-Image-2.6 Flare 다(개발 계획 v2 작업 09).
 * FASHN 이나 Qwen 을 셋째 후보로 시험하려면 결정 D3 로 새 상한을 받아 이 표에 더한다.
 */
export type TrialModel = "seedream" | "sunburst" | "flare";

/**
 * 모델별 호출 상한, 세 모델 합 422건. 결정 D3(시험 숫자 한 묶음) 승인 전 값이다.
 * 206 = 선택 세트 130, 확인 세트 40, 네 품목 탐색 36. Flare 는 차단 시험 10건.
 */
export const MODEL_CALL_CAPS: Record<TrialModel, number> = {
  seedream: 206,
  sunburst: 206,
  flare: 10,
};

export type TrialSet = "select" | "confirm" | "explore" | "block";
const SETS: readonly TrialSet[] = ["select", "confirm", "explore", "block"];

export interface TrialRequest {
  /** 요청 ID. 이어 돌리기에서 이미 부른 요청을 건너뛰는 열쇠다 */
  id: string;
  /** 같은 입력(트윈, 옷 조합)을 모델마다 부를 때 같은 값. 채점에서 나란히 견준다 */
  input: string;
  /** 선택 세트, 확인 세트, 네 품목 탐색, 차단 시험(정상 옷 요청이 막히는지) */
  set: TrialSet;
  model: TrialModel;
  twinKind: "realistic" | "doll";
  garmentSource: "own-photo" | "product";
  items: number;
  /** 1 은 처음 만든 장(p1), 2 는 정상이 아니어서 같은 입력으로 다시 만든 장(p2) */
  attempt: 1 | 2;
  twinImage: string;
  garmentImages: string[];
  prompt: string;
}

/** 파일 시스템, 잠금, 무작위를 밖에서 꽂는다. 시험은 메모리 파일 시스템을 쓴다 */
export interface TrialIo {
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string | null>;
  /** 채점 그림을 쓴다. 파일 시각은 모두 같은 값으로 맞춘다(시각으로 모델이 갈리지 않게) */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  /** 잠금 파일을 만든다. 이미 있으면 던진다. 돌려준 함수로 푼다 */
  lock(path: string): Promise<() => Promise<void>>;
  randomName(): string;
  /** 0 이상 1 미만 */
  random(): number;
  now(): number;
}

/** 채점 CSV. normal 은 기획자, outside_1, outside_2 는 바깥 평가자가 y 나 n 으로 채운다 */
export const SCORING_COLUMNS = [
  "file",
  "input",
  "set",
  "twin_kind",
  "garment_source",
  "items",
  "attempt",
  "normal",
  "fail_reason",
  "outside_sample",
  "outside_1",
  "outside_2",
] as const;

export const CALL_COLUMNS = [
  "request_id",
  "file",
  "input",
  "model",
  "provider",
  "set",
  "twin_kind",
  "garment_source",
  "items",
  "attempt",
  "status",
  "blocked_reason",
  "cost_usd",
  "billing_checked",
  "elapsed_ms",
  "called_at",
] as const;

export interface TrialResult {
  called: number;
  skipped: number;
  /** 부르기 전 줄만 있고 결과 줄이 없는 요청. 다시 부르지 않고 알린다 */
  interrupted: string[];
  /** 상한에 닿아 부르지 않은 모델과 그 요청 수 */
  capped: Partial<Record<TrialModel, number>>;
}

/** 요청 ID 마다 한 번씩 모델별로 센다(거절, 무응답, 공급사 오류, 도중에 끊긴 호출 포함) */
function countCalls(calls: readonly CsvRow[]): Record<TrialModel, number> {
  const counts: Record<TrialModel, number> = { seedream: 0, sunburst: 0, flare: 0 };
  const seen = new Set<string>();
  for (const row of calls) {
    const id = row.request_id ?? "";
    const model = row.model as TrialModel;
    if (seen.has(id) || !(model in counts)) continue;
    seen.add(id);
    counts[model] += 1;
  }
  return counts;
}

function statusOf(outcome: ProviderOutcome | Error) {
  if (outcome instanceof Error) return { status: "error", reason: outcome.message, cost: "" };
  if (outcome.kind === "succeeded")
    return { status: outcome.kind, reason: "", cost: String(outcome.costUsd) };
  if (outcome.kind === "refused") {
    return {
      status: "refused",
      reason: outcome.reason,
      cost: outcome.costUsd === undefined ? "" : String(outcome.costUsd),
    };
  }
  return { status: outcome.kind, reason: "", cost: "" };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** 요청 목록이 상한 표에 없는 모델이나 모르는 세트를 쓰면 첫 호출 전에 멈춘다 */
function validate(requests: readonly TrialRequest[], caps: Record<TrialModel, number>): void {
  const ids = new Set<string>();
  for (const request of requests) {
    if (!(request.model in caps)) throw new Error(`상한 표에 없는 모델이다: ${request.model}`);
    if (!SETS.includes(request.set)) throw new Error(`모르는 세트다: ${request.set}`);
    if (ids.has(request.id)) throw new Error(`요청 ID 가 겹친다: ${request.id}`);
    ids.add(request.id);
  }
}

/**
 * 요청을 섞은 차례로 하나씩 부른다. 동시에 부르지 않는다.
 * 상한은 실험 전체가 함께 쓰는 호출 장부 하나(ledgerPath)로 센다. 출력 폴더를 바꿔도 셈이 이어진다.
 * 상한에 닿은 모델의 요청은 부르지 않고 건너뛴다. 각 호출은 부르기 전에 장부에 「calling」 줄을 먼저 남긴다.
 */
export async function runTrial(
  requests: readonly TrialRequest[],
  providers: Partial<Record<TrialModel, GenerationProvider>>,
  options: { ledgerPath: string; scoringDir: string; caps?: Record<TrialModel, number> },
  io: TrialIo,
): Promise<TrialResult> {
  const caps = options.caps ?? MODEL_CALL_CAPS;
  validate(requests, caps);
  for (const model of new Set(requests.map((request) => request.model))) {
    if (!providers[model]) throw new Error(`${model} 공급사가 꽂혀 있지 않다`);
  }
  const release = await io.lock(`${options.ledgerPath}.lock`);
  try {
    return await runLocked(requests, providers, options, caps, io);
  } finally {
    await release();
  }
}

async function runLocked(
  requests: readonly TrialRequest[],
  providers: Partial<Record<TrialModel, GenerationProvider>>,
  { ledgerPath, scoringDir }: { ledgerPath: string; scoringDir: string },
  caps: Record<TrialModel, number>,
  io: TrialIo,
): Promise<TrialResult> {
  const scoringPath = `${scoringDir}/scoring.csv`;
  const calls = parseCsv((await io.readText(ledgerPath)) ?? "");
  if (calls.length === 0) await io.appendText(ledgerPath, csvHeader(CALL_COLUMNS));
  const scoring = parseCsv((await io.readText(scoringPath)) ?? "");
  if (scoring.length === 0 && !(await io.readText(scoringPath))) {
    await io.appendText(scoringPath, csvHeader(SCORING_COLUMNS));
  }
  // 한 채점 폴더의 그림은 한 형식이어야 한다. 확장자로 모델이 갈리지 않게.
  let folderKind: ImageKind | null = scoring[0]?.file?.endsWith(".png")
    ? "png"
    : scoring[0]
      ? "jpeg"
      : null;

  const lastStatus = new Map(calls.map((row) => [row.request_id ?? "", row.status ?? ""]));
  const interrupted = [...lastStatus]
    .filter(([, status]) => status === "calling")
    .map(([id]) => id);
  const counts = countCalls(calls);
  const result: TrialResult = { called: 0, skipped: 0, interrupted, capped: {} };

  for (const request of shuffled(requests, () => io.random())) {
    if (lastStatus.has(request.id)) {
      result.skipped += 1;
      continue;
    }
    if (counts[request.model] >= caps[request.model]) {
      result.capped[request.model] = (result.capped[request.model] ?? 0) + 1;
      continue;
    }
    const provider = providers[request.model] as GenerationProvider;
    const base: CsvRow = {
      request_id: request.id,
      input: request.input,
      model: request.model,
      provider: provider.name,
      set: request.set,
      twin_kind: request.twinKind,
      garment_source: request.garmentSource,
      items: String(request.items),
      attempt: String(request.attempt),
    };
    // 부르기 전에 남긴다. 도중에 죽으면 이 줄만 남고, 다시 돌려도 그 요청은 부르지 않으며 상한에 센다.
    await io.appendText(
      ledgerPath,
      csvLine(CALL_COLUMNS, {
        ...base,
        status: "calling",
        called_at: new Date(io.now()).toISOString(),
      }),
    );
    counts[request.model] += 1;
    result.called += 1;
    const outcome = await callProvider(provider, {
      twinImage: await io.readFile(request.twinImage),
      garmentImages: await Promise.all(request.garmentImages.map((path) => io.readFile(path))),
      prompt: request.prompt,
    }).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
    const { status, reason, cost } = statusOf(outcome);
    let file = "";
    if (!(outcome instanceof Error) && outcome.kind === "succeeded") {
      const clean = stripMetadata(outcome.image);
      folderKind ??= clean.kind;
      if (clean.kind !== folderKind) {
        throw new Error(
          `채점 폴더에 ${folderKind} 와 ${clean.kind} 가 섞인다. 확장자로 모델이 드러나 멈춘다(한 형식으로 굽는 법을 정한다)`,
        );
      }
      file = `${io.randomName()}.${clean.kind === "jpeg" ? "jpg" : "png"}`;
      await io.writeFile(`${scoringDir}/${file}`, clean.bytes);
      await io.appendText(scoringPath, csvLine(SCORING_COLUMNS, { ...base, file }));
    }
    await io.appendText(
      ledgerPath,
      csvLine(CALL_COLUMNS, {
        ...base,
        file,
        status,
        blocked_reason: reason,
        cost_usd: cost,
        elapsed_ms: outcome instanceof Error ? "" : String(outcome.elapsedMs),
        called_at: new Date(io.now()).toISOString(),
      }),
    );
  }
  return result;
}

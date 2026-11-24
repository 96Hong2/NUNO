import {
  callProvider,
  type GenerationProvider,
  type ProviderOutcome,
} from "../generation/provider.ts";
import { csvColumns, csvHeader, csvLine, csvShapeProblem, parseCsv, type CsvRow } from "./csv.ts";
import { stripMetadata, type ImageKind } from "./strip-metadata.ts";

// 반증 실험 호출 스크립트의 본체. 요청 목록을 부르고 결과를 채점 폴더와 호출 장부로 나눠 남긴다.
// 채점 폴더(scoring/)에는 모델을 가린 그림과 채점 CSV 만 둔다.
// 모델, 공급사, 청구액, 응답 시간, 차단 사유는 채점 폴더 밖의 호출 장부(calls.csv)에만 둔다.

/**
 * 반증 실험 모델. 셋째 자리는 차단 시험 전용 GPT-Image-2.6 Flare 다(개발 계획 v2 작업 09).
 * FASHN 이나 Qwen 을 셋째 후보로 시험하려면 기획자에게 새 상한을 승인받아 이 표에 더한다.
 */
export type TrialModel = "seedream" | "sunburst" | "flare";

/**
 * 모델별 호출 상한, 세 모델 합 422건. 기획자가 시험 숫자를 승인하기 전 값이다.
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
  /** 그림을 쓴다. 파일 시각(mtime)은 모두 같은 값으로 맞춘다(시각으로 모델이 갈리지 않게) */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /**
   * 대기 폴더의 그림을 채점 폴더로 옮긴다(새로 복사한 뒤 원본을 지운다: inode 도 섞인 차례로 생긴다).
   * 원본이 없을 때만 false, 다른 오류는 던진다.
   */
  moveFile(from: string, to: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  /** 글 파일을 통째로 다시 쓴다(채점 CSV 를 섞어 다시 쓸 때) */
  writeText(path: string, text: string): Promise<void>;
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
  "scoring_dir",
] as const;

export interface TrialOptions {
  ledgerPath: string;
  scoringDir: string;
  caps?: Record<TrialModel, number>;
  /** 참이면 지금 호출을 마친 뒤 더 부르지 않고 끝낸다(Ctrl-C). 그림 옮기기와 잠금 풀기는 돈다 */
  shouldStop?: () => boolean;
}

/** 줄바꿈 없이 끝난 파일(스프레드시트가 다시 저장한 장부)에 덧붙이면 앞 줄과 붙는다. 먼저 줄바꿈을 맞춘다 */
async function appendLine(io: TrialIo, path: string, line: string): Promise<void> {
  const text = await io.readText(path);
  const gap = text && !/[\r\n]$/.test(text) ? "\n" : "";
  await io.appendText(path, gap + line);
}

export interface TrialResult {
  called: number;
  skipped: number;
  /** 부르기 전 줄만 있고 결과 줄이 없는 요청. 다시 부르지 않고 알린다(공급사가 청구했을 수 있다) */
  interrupted: string[];
  /** 장부에는 성공으로 적혔는데 대기 폴더에도 채점 폴더에도 없는 그림(청구됐는데 잃었다) */
  missing: string[];
  /** 멈춤 요청(Ctrl-C)으로 지금 호출을 마치고 끝냈는지 */
  stopped: boolean;
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
  options: TrialOptions,
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

const REQUIRED_LEDGER = ["request_id", "model", "status", "file"];

/** 장부 머리줄이 망가졌으면(엑셀이 열 이름을 바꾸는 등) 셈이 틀리므로 첫 호출 전에 멈춘다 */
function checkLedgerHeader(text: string | null): void {
  if (!text) return;
  const firstLine = (text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "").split(",");
  const header = firstLine.map((name) => name.trim().replace(/^"|"$/g, ""));
  const missing = REQUIRED_LEDGER.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(
      `호출 장부 머리줄에 ${missing.join(", ")} 열이 없다. 장부를 고친 뒤 다시 돌린다`,
    );
  }
}

/**
 * 장부에는 성공으로 있는데 채점 CSV 에 아직 없는 그림을 채점 폴더로 옮기고, 채점 CSV 를 통째로 섞어 다시 쓴다.
 * - 한꺼번에 옮기고 줄을 모두 섞어서, 파일 시각(ctime), inode, 줄 순서로 호출 차례나 실행 묶음이 드러나지 않는다.
 * - 기획자가 채운 칸은 그대로 둔다. 옮긴 직후 죽어 줄이 없는 그림은 채점 폴더에서 찾아 줄만 더한다.
 * - 실행이 도중에 죽어 남은 그림도 다음 실행 처음에 이 함수가 옮긴다. 어디에도 없는 그림은 돌려준다.
 */
async function flushStaged(ledgerPath: string, scoringDir: string, io: TrialIo): Promise<string[]> {
  const scoringPath = `${scoringDir}/scoring.csv`;
  const text = (await io.readText(scoringPath)) ?? "";
  const rows = parseCsv(text);
  const scored = new Set(rows.map((row) => row.file));
  // 장부 하나로 채점 폴더 여럿을 쓸 수 있다. 이 폴더로 갈 그림만 본다(폴더 칸이 빈 줄은 이 폴더 것으로 본다).
  const pending = parseCsv((await io.readText(ledgerPath)) ?? "").filter(
    (row) =>
      row.status === "succeeded" &&
      row.file &&
      !scored.has(row.file) &&
      (row.scoring_dir || scoringDir) === scoringDir,
  );
  const missing: string[] = [];
  const added: CsvRow[] = [];
  for (const row of shuffled(pending, () => io.random())) {
    const file = row.file ?? "";
    const target = `${scoringDir}/${file}`;
    const moved = await io.moveFile(`${stagingDir(ledgerPath, scoringDir)}/${file}`, target);
    if (moved || (await io.exists(target))) added.push(row);
    else missing.push(file);
  }
  if (added.length > 0 || !text) {
    // 기획자가 더한 열과 그 순서, BOM 을 그대로 두고 빠진 기본 열만 뒤에 붙인다.
    const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
    const header = text ? csvColumns(text) : [];
    const columns = [...header, ...SCORING_COLUMNS.filter((column) => !header.includes(column))];
    const all = shuffled([...rows, ...added], () => io.random());
    await io.writeText(
      scoringPath,
      bom + csvHeader(columns) + all.map((row) => csvLine(columns, row)).join(""),
    );
  }
  return missing;
}

/** 채점 폴더마다 대기 폴더를 따로 둔다. 남은 그림이 다른 채점 폴더로 가지 않게 */
function stagingDir(ledgerPath: string, scoringDir: string): string {
  return `${ledgerPath}.staging/${scoringDir.replace(/[^A-Za-z0-9가-힣._-]/g, "_")}`;
}

/** 스프레드시트가 UTF-8 이 아닌 글자 표(CP949 등)로 저장하면 한글이 깨진 채 다시 써져 되돌릴 수 없다 */
function checkUtf8(path: string, text: string | null): void {
  if (text?.includes("\uFFFD")) {
    throw new Error(
      `${path} 가 UTF-8 이 아니다. 스프레드시트에서 「CSV UTF-8」 로 다시 저장한 뒤 돌린다`,
    );
  }
}

async function runLocked(
  requests: readonly TrialRequest[],
  providers: Partial<Record<TrialModel, GenerationProvider>>,
  { ledgerPath, scoringDir, shouldStop }: TrialOptions,
  caps: Record<TrialModel, number>,
  io: TrialIo,
): Promise<TrialResult> {
  const ledgerText = await io.readText(ledgerPath);
  checkUtf8(ledgerPath, ledgerText);
  const scoringText = await io.readText(`${scoringDir}/scoring.csv`);
  checkUtf8(`${scoringDir}/scoring.csv`, scoringText);
  // 채점 CSV 는 다시 쓴다. 이름으로 칸을 옮기면 값을 잃는 모양이면 첫 호출 전에 멈춘다.
  const shape = scoringText ? csvShapeProblem(scoringText) : null;
  if (shape) throw new Error(`채점 CSV ${shape}. 열 이름을 고친 뒤 다시 돌린다`);
  checkLedgerHeader(ledgerText);
  const calls = parseCsv(ledgerText ?? "");
  if (!ledgerText) await io.appendText(ledgerPath, csvHeader(CALL_COLUMNS));
  const missingBefore = await flushStaged(ledgerPath, scoringDir, io);
  // 한 채점 폴더의 그림은 한 형식이어야 한다. 확장자로 모델이 갈리지 않게. 장부의 성공 줄로 정한다.
  const firstFile = calls.find((row) => row.status === "succeeded" && row.file)?.file;
  let folderKind: ImageKind | null = firstFile
    ? firstFile.endsWith(".png")
      ? "png"
      : "jpeg"
    : null;

  const lastStatus = new Map(calls.map((row) => [row.request_id ?? "", row.status ?? ""]));
  const interrupted = [...lastStatus]
    .filter(([, status]) => status === "calling")
    .map(([id]) => id);
  const counts = countCalls(calls);
  const result: TrialResult = {
    called: 0,
    skipped: 0,
    interrupted,
    missing: [],
    stopped: false,
    capped: {},
  };

  try {
    for (const request of shuffled(requests, () => io.random())) {
      if (shouldStop?.()) {
        result.stopped = true;
        break;
      }
      if (lastStatus.has(request.id)) {
        result.skipped += 1;
        continue;
      }
      if (counts[request.model] >= caps[request.model]) {
        result.capped[request.model] = (result.capped[request.model] ?? 0) + 1;
        continue;
      }
      const provider = providers[request.model] as GenerationProvider;
      // 입력 그림은 부르기 전 줄을 쓰기 전에 읽는다. 경로가 틀리면 상한 칸을 쓰지 않고 멈춘다.
      const input = {
        twinImage: await io.readFile(request.twinImage),
        garmentImages: await Promise.all(request.garmentImages.map((path) => io.readFile(path))),
        prompt: request.prompt,
      };
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
      await appendLine(
        io,
        ledgerPath,
        csvLine(CALL_COLUMNS, {
          ...base,
          status: "calling",
          called_at: new Date(io.now()).toISOString(),
        }),
      );
      counts[request.model] += 1;
      result.called += 1;
      const outcome = await callProvider(provider, input).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      );
      const { status, reason, cost } = statusOf(outcome);
      const record = (extra: CsvRow) =>
        appendLine(
          io,
          ledgerPath,
          csvLine(CALL_COLUMNS, {
            ...base,
            status,
            blocked_reason: reason,
            cost_usd: cost,
            elapsed_ms: outcome instanceof Error ? "" : String(outcome.elapsedMs),
            called_at: new Date(io.now()).toISOString(),
            ...extra,
          }),
        );
      if (outcome instanceof Error || outcome.kind !== "succeeded") {
        await record({});
        continue;
      }
      // 받은 그림을 쓸 수 없어도(형식 오류, 형식 섞임) 청구액과 응답 시간은 장부에 먼저 남기고 멈춘다.
      let clean: ReturnType<typeof stripMetadata>;
      try {
        clean = stripMetadata(outcome.image);
        folderKind ??= clean.kind;
        if (clean.kind !== folderKind) {
          throw new Error(
            `채점 폴더에 ${folderKind} 와 ${clean.kind} 가 섞인다. 확장자로 모델이 드러나 멈춘다(한 형식으로 굽는 법을 정한다)`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await record({ status: "unusable", blocked_reason: message });
        throw error;
      }
      const file = `${io.randomName()}.${clean.kind === "jpeg" ? "jpg" : "png"}`;
      // 대기 폴더에 그림을 먼저 쓰고 장부 결과 줄을 쓴다. 그 사이에 죽으면 calling 만 남아 「끊긴 호출」 로 알려진다.
      // 채점 폴더로는 끝날 때 섞어 옮긴다.
      await io.writeFile(`${stagingDir(ledgerPath, scoringDir)}/${file}`, clean.bytes);
      await record({ file, scoring_dir: scoringDir });
    }
  } finally {
    // 처음과 끝 두 번 옮기므로 같은 그림이 두 번 나올 수 있다. 한 번만 알린다.
    const missingAfter = await flushStaged(ledgerPath, scoringDir, io);
    result.missing = [...new Set([...missingBefore, ...missingAfter])];
  }
  return result;
}

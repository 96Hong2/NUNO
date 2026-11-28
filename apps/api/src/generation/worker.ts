import { randomUUID } from "node:crypto";
import type { SqlClient } from "../db/sql-client.ts";
import type { ImageCheck, PushSender, ResultStore } from "./ports.ts";
import {
  callProvider,
  PROVIDER_TIMEOUT_MS,
  type GenerationProvider,
  type GenerationRequest,
  type ProviderOutcome,
} from "./provider.ts";

/** 선점 기한. 공급사 시한에 결과 저장과 검사 몫 30초를 더한다. 넘기면 예약 작업이 실패와 풀기로 정리한다. */
export const LEASE_SECONDS = PROVIDER_TIMEOUT_MS / 1000 + 30;

/**
 * 접수 상태로 기다리는 상한. 넘긴 작업은 공급사를 부르지 않고 실패와 풀기다.
 * 기획자가 정한 임시값이고, 공급사 응답 시간을 잰 뒤 확정한다.
 */
export const QUEUE_WAIT_SECONDS = 5 * 60;

export interface ClaimedJob {
  jobId: string;
  userId: string;
  manifest: unknown;
  paymentKind: "trial" | "gold";
  /** 접수 때 작업에 적은 공급사 설정 줄. 판 0004 전에 받았거나 그 줄을 지웠으면 null */
  providerConfig: { id: string; provider: string; model: string } | null;
}

/**
 * 시도 시작 함수가 공급사를 부르기 전에 작업을 실패로 끝낼 때 적는 코드.
 * 이 코드로 끝났으면 worker 가 푸시를 보낸다. 다른 코드는 예약 작업이 끝내고 푸시도 그쪽이 보낸다.
 */
const START_REFUSALS: ReadonlySet<string> = new Set([
  "account_inactive",
  "consent_withdrawn",
  "provider_changed",
  "consent_outdated",
  "budget_exhausted",
]);

export interface ProviderChoice {
  provider: GenerationProvider;
  model: string;
  /** 개발 전용: 첫 회차 검사를 떨어뜨려 다시 만들기를 본다. */
  failCheckOnce: boolean;
}

export interface WorkerDeps {
  db: SqlClient;
  store: ResultStore;
  check: ImageCheck;
  push: PushSender;
  now: () => Date;
  chooseProvider(job: ClaimedJob): Promise<ProviderChoice>;
  /** 공급사 시한. 기본은 `PROVIDER_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** 끝난 모양. lost 는 선점을 잃어 아무것도 바꾸지 못한 것이다(예약 작업이 이미 정리했다). */
export type JobOutcome = "succeeded" | "failed" | "lost";

type CallResult = ProviderOutcome | { kind: "error"; message: string; elapsedMs: number };

const FAILURE_CODES: Record<Exclude<CallResult["kind"], "succeeded">, string> = {
  refused: "provider_refused",
  timed_out: "provider_timeout",
  error: "provider_error",
};

function attemptRecord(result: CallResult) {
  switch (result.kind) {
    case "succeeded":
      return { status: "completed", billing: "billed", cost: result.costUsd, error: null };
    case "refused":
      return {
        status: "rejected",
        billing: result.costUsd === undefined ? "unknown" : "billed",
        cost: result.costUsd ?? null,
        error: result.reason,
      };
    case "timed_out":
      return { status: "unknown", billing: "unknown", cost: null, error: "timed_out" };
    case "error":
      return { status: "failed", billing: "unknown", cost: null, error: result.message };
  }
}

interface ClaimRow {
  job_id: string;
  user_id: string;
  input_manifest: unknown;
  payment_kind: "trial" | "gold";
  queue_timed_out: boolean;
}

/**
 * 접수 작업 하나를 선점한다. 선점 함수가 대기 상한을 넘긴 작업을 만나면 그 작업을 queue_timeout 으로 끝내고
 * 그 행을 준다. 그때는 실패를 알리고 다시 부른다. 한 번에 한 건이라 부를 때마다 트랜잭션 하나다.
 */
async function claimJob(deps: WorkerDeps, leaseToken: string): Promise<ClaimRow | null> {
  for (;;) {
    const [row] = await deps.db.query<ClaimRow>("SELECT * FROM nuno_claim_job($1, $2, $3, $4)", [
      leaseToken,
      LEASE_SECONDS,
      deps.now(),
      QUEUE_WAIT_SECONDS,
    ]);
    if (!row) return null;
    if (!row.queue_timed_out) return row;
    await deps.push.send({ userId: row.user_id, jobId: row.job_id, status: "failed" });
  }
}

/**
 * 접수 작업 하나를 선점해 끝까지 돌린다. 접수 작업이 없으면 null.
 * 대기 상한을 넘긴 작업은 공급사를 부르지 않고 실패로 끝낸 뒤 다음 작업을 본다.
 */
export async function runNextJob(
  deps: WorkerDeps,
  leaseToken: string = randomUUID(),
): Promise<{ jobId: string; outcome: JobOutcome } | null> {
  const row = await claimJob(deps, leaseToken);
  if (!row) return null;
  const [config] = await deps.db.query<{ id: string; provider: string; model: string }>(
    `SELECT c.id, c.provider, c.model
     FROM generation_jobs j JOIN provider_configs c ON c.id = j.provider_config_id
     WHERE j.id = $1`,
    [row.job_id],
  );
  const job: ClaimedJob = {
    jobId: row.job_id,
    userId: row.user_id,
    manifest: row.input_manifest,
    paymentKind: row.payment_kind,
    providerConfig: config ?? null,
  };

  let outcome: JobOutcome;
  try {
    outcome = await runClaimed(deps, job, leaseToken);
  } catch (error) {
    console.error(`작업 ${job.jobId} 실행 중 오류`, error);
    outcome = await failJob(deps, job, leaseToken, "worker_error");
  }
  if (outcome !== "lost") {
    await deps.push.send({ userId: job.userId, jobId: job.jobId, status: outcome });
  }
  return { jobId: job.jobId, outcome };
}

async function failJob(
  deps: WorkerDeps,
  job: ClaimedJob,
  leaseToken: string,
  failureCode: string,
): Promise<JobOutcome> {
  const [row] = await deps.db.query<{ failed: boolean; result_key: string | null }>(
    "SELECT * FROM nuno_job_fail($1, $2, $3, $4)",
    [job.jobId, leaseToken, failureCode, deps.now()],
  );
  if (row?.result_key) await deps.store.remove(row.result_key);
  return row?.failed ? "failed" : "lost";
}

/** 차례: 시도 줄 → 공급사 → 시도 마침 → gen30 저장 → 검사 중 → 검사 → 완료, 다시 만들기(한 번), 실패. */
async function runClaimed(
  deps: WorkerDeps,
  job: ClaimedJob,
  leaseToken: string,
): Promise<JobOutcome> {
  const { db, store, now } = deps;
  const choice = await deps.chooseProvider(job);
  // 올리기와 입력 검사가 갖춰지기 전이라 입력 그림은 비워 둔다. 그때까지 실제 공급사 어댑터는 켜지 않는다.
  const request: GenerationRequest = { twinImage: new Uint8Array(), garmentImages: [], prompt: "" };

  for (const round of [1, 2]) {
    const [attempt] = await db.query<{ id: string | null }>(
      "SELECT nuno_start_attempt($1, $2, $3, $4, $5) AS id",
      [job.jobId, leaseToken, choice.provider.name, choice.model, now()],
    );
    if (!attempt?.id) return refusedBeforeCall(deps, job.jobId);

    const started = Date.now();
    const result: CallResult = await callProvider(choice.provider, request, {
      timeoutMs: deps.timeoutMs ?? PROVIDER_TIMEOUT_MS,
    }).catch((error: unknown) => ({
      kind: "error" as const,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    }));
    const record = attemptRecord(result);
    const [finished] = await db.query<{ ok: boolean }>(
      "SELECT nuno_finish_attempt($1, $2, $3, $4, $5, $6, $7, $8, $9) AS ok",
      [
        job.jobId,
        leaseToken,
        attempt.id,
        record.status,
        record.billing,
        record.cost,
        Math.round(result.elapsedMs),
        record.error,
        now(),
      ],
    );
    if (!finished?.ok) return "lost";
    if (result.kind !== "succeeded") {
      return failJob(deps, job, leaseToken, FAILURE_CODES[result.kind]);
    }

    const key = `gen30/${job.userId}/${job.jobId}-${round}.jpg`;
    await store.put(key, result.image, result.mimeType);
    const [checking] = await db.query<{ id: string | null }>(
      "SELECT nuno_job_checking($1, $2, $3, $4) AS id",
      [job.jobId, leaseToken, key, now()],
    );
    if (!checking?.id) {
      await store.remove(key);
      return "lost";
    }

    const verdict =
      choice.failCheckOnce && round === 1 ? "fail" : await deps.check.check(result.image);
    if (verdict === "pass") {
      const [succeeded] = await db.query<{ ok: boolean }>(
        "SELECT nuno_job_succeed($1, $2, $3) AS ok",
        [job.jobId, leaseToken, now()],
      );
      return succeeded?.ok ? "succeeded" : "lost";
    }
    if (round === 2) break;

    const [retry] = await db.query<{ key: string | null }>(
      "SELECT nuno_job_retry($1, $2, $3, $4) AS key",
      [job.jobId, leaseToken, LEASE_SECONDS, now()],
    );
    if (!retry?.key) break;
    await store.remove(retry.key);
  }
  return failJob(deps, job, leaseToken, "check_failed");
}

/** 시도 줄을 받지 못했을 때. 시도 시작 함수가 작업을 끝냈으면 failed, 선점을 잃었으면 lost 다. */
async function refusedBeforeCall(deps: WorkerDeps, jobId: string): Promise<JobOutcome> {
  const [row] = await deps.db.query<{ status: string; failure_code: string | null }>(
    "SELECT status, failure_code FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  return row?.status === "failed" && row.failure_code && START_REFUSALS.has(row.failure_code)
    ? "failed"
    : "lost";
}

/** 예약 작업. 선점 기한이 지난 작업을 실패와 풀기로 끝내고 남은 결과 파일을 지운다. 정리한 작업 수를 낸다. */
export async function sweepJobs(
  deps: Omit<WorkerDeps, "check" | "chooseProvider">,
): Promise<number> {
  const rows = await deps.db.query<{ job_id: string; user_id: string; result_key: string | null }>(
    "SELECT * FROM nuno_sweep_jobs($1)",
    [deps.now()],
  );
  for (const row of rows) {
    if (row.result_key) await deps.store.remove(row.result_key);
    await deps.push.send({ userId: row.user_id, jobId: row.job_id, status: "failed" });
  }
  return rows.length;
}

/** 예약 작업 한 바퀴에서 정산 함수를 부르는 최대 횟수. 남은 시도는 다음 바퀴가 정산한다. */
const SETTLE_CALLS_PER_SWEEP = 100;

/**
 * 예약 작업. 끝난 작업에 예약 상태로 남은 시도의 예산을 정산한다. 정산한 시도 수를 낸다.
 * 시도마다 문장 하나, 곧 트랜잭션 하나로 부른다. 여러 시도를 한 트랜잭션에서 정산하면 예산 행을 쥔 채
 * 다른 사용자 행을 기다리게 되어 worker 와 교착이 생긴다.
 */
export async function settleBudgets(deps: Pick<WorkerDeps, "db" | "now">): Promise<number> {
  let settled = 0;
  for (let call = 0; call < SETTLE_CALLS_PER_SWEEP; call += 1) {
    const [row] = await deps.db.query<{ status: string | null }>(
      "SELECT nuno_settle_next_budget($1) AS status",
      [deps.now()],
    );
    if (!row?.status) break;
    if (row.status !== "skipped") settled += 1;
  }
  return settled;
}

/** 한 바퀴에서 대기 만료 함수와 결과 정리 함수를 부르는 최대 횟수. 남은 것은 다음 바퀴가 다룬다. */
const EXPIRE_CALLS_PER_SWEEP = 100;

/**
 * 예약 작업. 대기 상한을 넘긴 접수 작업을 실패와 풀기로 끝내고 알린다. 끝낸 작업 수를 낸다.
 * 선점이 밀려 있어도 그 작업들이 상한 직후에 끝나게 한다. 선점 함수도 상한을 따로 보므로 공급사로 가는 길을 막는 것은 이 함수가 아니다.
 * 작업마다 문장 하나, 곧 트랜잭션 하나로 부른다. 한 트랜잭션이 여러 사용자 행을 잠그지 않는다.
 */
export async function expireQueuedJobs(
  deps: Pick<WorkerDeps, "db" | "push" | "now">,
): Promise<number> {
  let expired = 0;
  for (let call = 0; call < EXPIRE_CALLS_PER_SWEEP; call += 1) {
    const [row] = await deps.db.query<{ job_id: string; user_id: string; expired: boolean }>(
      "SELECT * FROM nuno_expire_next_queued_job($1, $2)",
      [deps.now(), QUEUE_WAIT_SECONDS],
    );
    if (!row) break;
    if (!row.expired) continue;
    expired += 1;
    await deps.push.send({ userId: row.user_id, jobId: row.job_id, status: "failed" });
  }
  return expired;
}

/**
 * 예약 작업. 룩북에 저장하지 않은 채 보관 기한이 지난 결과의 파일을 지우고 DB 를 deleted 로 적는다.
 * 파일이 먼저다. 그 사이에 죽으면 DB 는 gen30 으로 남아 다음 바퀴가 다시 지운다. DB 로 찾지 못하는 파일이 남지 않는다.
 * 지움으로 적은 결과 수를 낸다.
 */
export async function expireResults(
  deps: Pick<WorkerDeps, "db" | "store" | "now">,
): Promise<number> {
  const at = deps.now();
  const due = await deps.db.query<{ id: string; r2_key: string }>(
    `SELECT id, r2_key FROM generation_results
     WHERE storage_state = 'gen30' AND delete_due_at <= $1
     ORDER BY delete_due_at, id
     LIMIT ${EXPIRE_CALLS_PER_SWEEP}`,
    [at],
  );
  let expired = 0;
  for (const row of due) {
    await deps.store.remove(row.r2_key);
    const [done] = await deps.db.query<{ ok: boolean }>("SELECT nuno_expire_result($1, $2) AS ok", [
      row.id,
      at,
    ]);
    if (done?.ok) expired += 1;
  }
  return expired;
}

export interface DevProviderMode {
  mode: "succeed" | "refuse" | "hang";
  delayMs: number;
  failCheckOnce: boolean;
}

/** 개발 전용 가짜 공급사 모드. 줄이 없으면 succeed, 지연 0 이다. */
export async function devProviderMode(db: SqlClient, userId: string): Promise<DevProviderMode> {
  const [row] = await db.query<{
    mode: DevProviderMode["mode"];
    delay_ms: number;
    fail_check_once: boolean;
  }>("SELECT mode, delay_ms, fail_check_once FROM dev_provider_modes WHERE user_id = $1", [userId]);
  return {
    mode: row?.mode ?? "succeed",
    delayMs: row?.delay_ms ?? 0,
    failCheckOnce: row?.fail_check_once ?? false,
  };
}

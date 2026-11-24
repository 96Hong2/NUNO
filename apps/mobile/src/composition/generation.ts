import {
  attachGenerationJob,
  buildManifest,
  CONSENT_TEXT_VERSION,
  deleteGenerationRequest,
  deleteGenerationRequestByJob,
  findUnansweredRequest,
  insertGenerationRequest,
  latestUnsavedJobId,
  isFinishedStatus,
  listWatchedRequests,
  markGenerationSeen,
  nextAfterRejection,
  outfitKeyOf,
  readGenerationRequestByJob,
  updateGenerationStatus,
  type GenerationManifest,
  type ManifestGarment,
  type PaymentKind,
  type SubmitNext,
} from "@nuno/generation";
import type { SqlExecutor } from "@nuno/device-db";
import { listGarmentsWithPerson } from "@nuno/wardrobe";
import { apiRequest, type ApiResult } from "../adapters/api-client";
import { systemClock } from "../adapters/system-clock";
import { uuidGenerator } from "../adapters/uuid";
import { forgetSession, sessionToken } from "./account";
import { getDeviceDb } from "./device-db";

// 「이대로 입히기」: 접수, 작업 조회, 결과 버리기와 저장, 작업 감시.
// 요청 ID 는 보내기 전에 기기 표 generation_requests 에 적어, 응답 전에 앱이 꺼져도 같은 ID 로 다시 묻는다.

export interface JobView {
  jobId: string;
  status: string;
  paymentKind: PaymentKind;
  failureCode: string | null;
  result: { url: string; expiresAt: string } | null;
  refund: { kind: PaymentKind; amount: number } | null;
}

interface SubmitResponse {
  jobId: string;
  status: string;
}

export type SubmitOutcome =
  { kind: "job"; jobId: string } | { kind: "hadPerson" } | { kind: "rejected"; next: SubmitNext };

const now = () => systemClock.now().toISOString();

/** 이 세션에서 접수 응답을 기다리는 요청. 작업 감시가 이 요청을 따로 묻지 않는다. */
const inFlight = new Set<string>();

function garmentIdOf(item: ManifestGarment): string | null {
  return item.id.startsWith("g:") ? item.id.slice(2) : null;
}

async function byRequest(token: string, requestId: string): Promise<ApiResult<JobView>> {
  return apiRequest<JobView>(`/v1/generation-jobs/by-request/${encodeURIComponent(requestId)}`, {
    token,
  });
}

async function post(
  token: string,
  requestId: string,
  manifest: GenerationManifest,
): Promise<ApiResult<SubmitResponse>> {
  return apiRequest<SubmitResponse>("/v1/generation-jobs", {
    method: "POST",
    token,
    body: { requestId, manifest, consentVersion: CONSENT_TEXT_VERSION },
  });
}

/** 무대에 사람이 함께 찍힌 사진으로 넣은 옷이 있는지. 그런 옷은 완성 룩으로 보내지 않는다 */
export async function hasPersonPhoto(items: readonly ManifestGarment[]): Promise<boolean> {
  const garmentIds = items.map(garmentIdOf).filter((id): id is string => id !== null);
  if (garmentIds.length === 0) return false;
  const { db } = await getDeviceDb();
  return (await listGarmentsWithPerson(db, garmentIds)).length > 0;
}

/**
 * 「무료로 만들기」, 「4골드 쓰기」: 지금 무대 코디로 완성 룩을 접수한다.
 * 사람이 함께 찍힌 옷이 있으면 보내지 않는다. 거절되면 domain 이 고른 다음 화면을 돌려준다.
 */
export async function submitGeneration(
  twinKey: string,
  items: readonly ManifestGarment[],
): Promise<SubmitOutcome> {
  if (await hasPersonPhoto(items)) return { kind: "hadPerson" };
  const { db } = await getDeviceDb();

  const token = await sessionToken();
  if (!token) return { kind: "rejected", next: nextAfterRejection("unauthorized") };

  const manifest = buildManifest(twinKey, items);
  const outfitKey = outfitKeyOf(manifest);
  // 이 접수가 다루는 요청 ID 는 끝날 때까지 작업 감시가 건드리지 않는다(적은 줄을 지우지 않게).
  const mine: string[] = [];
  const hold = (id: string) => {
    inFlight.add(id);
    mine.push(id);
    return id;
  };
  try {
    return await sendRequest(db, token, manifest, outfitKey, hold);
  } finally {
    for (const id of mine) inFlight.delete(id);
  }
}

async function sendRequest(
  db: SqlExecutor,
  token: string,
  manifest: GenerationManifest,
  outfitKey: string,
  hold: (id: string) => string,
): Promise<SubmitOutcome> {
  // 같은 코디로 보냈다가 응답을 받지 못한 요청이 있으면 서버가 받았는지 먼저 묻는다.
  let requestId: string | null = null;
  const leftover = await findUnansweredRequest(db, outfitKey);
  if (leftover && !inFlight.has(leftover.requestId)) {
    hold(leftover.requestId);
    const found = await byRequest(token, leftover.requestId);
    if (found.ok) {
      await attachGenerationJob(db, leftover.requestId, found.data.jobId, found.data.status);
      return { kind: "job", jobId: found.data.jobId };
    }
    if (found.status === 404) requestId = leftover.requestId;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!requestId) {
      requestId = hold(uuidGenerator.next());
      await insertGenerationRequest(db, { requestId, outfitKey, manifest }, now());
    }
    const result = await post(token, requestId, manifest);
    if (result.ok) {
      await attachGenerationJob(db, requestId, result.data.jobId, result.data.status);
      return { kind: "job", jobId: result.data.jobId };
    }
    if (result.status === 0) {
      // 닿지 못했다. 서버가 받았을 수 있어 줄을 남기고 작업 감시가 요청 ID 로 다시 묻는다.
      return { kind: "rejected", next: nextAfterRejection(result.error) };
    }
    await deleteGenerationRequest(db, requestId);
    if (result.status === 401) await forgetSession();
    // 같은 ID 에 다른 입력이 남아 있었다(옷 이름을 고친 뒤 등). 새 ID 로 한 번 더 보낸다.
    if (result.error === "request_mismatch" && attempt === 0) {
      requestId = null;
      continue;
    }
    return { kind: "rejected", next: nextAfterRejection(result.error) };
  }
  return { kind: "rejected", next: nextAfterRejection("request_mismatch") };
}

export type JobLoad = { kind: "ok"; job: JobView } | { kind: "missing" } | { kind: "error" };

/** 작업 상태와 결과 서명 주소. 기기 표의 상태도 함께 고친다. */
export async function loadJob(jobId: string): Promise<JobLoad> {
  const token = await sessionToken();
  if (!token) return { kind: "missing" };
  const result = await apiRequest<JobView>(`/v1/generation-jobs/${encodeURIComponent(jobId)}`, {
    token,
  });
  if (!result.ok)
    return result.status === 404 || result.status === 401 ? { kind: "missing" } : { kind: "error" };
  const { db } = await getDeviceDb();
  await updateGenerationStatus(db, jobId, result.data.status);
  return { kind: "ok", job: result.data };
}

/** 결과 화면이 보일 입은 옷. 이 기기에서 보낸 요청이 아니면 빈 목록이다 */
export async function loadJobItems(
  jobId: string,
): Promise<{ twinKey: string | null; items: ManifestGarment[] }> {
  const { db } = await getDeviceDb();
  const request = await readGenerationRequestByJob(db, jobId);
  return { twinKey: request?.manifest.twin.preset ?? null, items: request?.manifest.items ?? [] };
}

/** 끝난 작업을 봤다고 적는다(작업 감시가 다시 알리지 않는다) */
export async function markJobSeen(jobId: string): Promise<void> {
  const { db } = await getDeviceDb();
  await markGenerationSeen(db, jobId);
}

/** 「나가기」: 결과를 지운다. 지운 뒤에는 적어 둔 서명 주소도 열리지 않는다 */
export async function discardJob(jobId: string): Promise<boolean> {
  const token = await sessionToken();
  if (!token) return false;
  const result = await apiRequest(`/v1/generation-jobs/${encodeURIComponent(jobId)}/discard`, {
    method: "POST",
    token,
  });
  const done = result.ok || result.status === 404;
  if (done) await forgetJob(jobId);
  return done;
}

/** 「내 룩북에 저장」: 입은 옷 이름, 분류, 칸을 함께 저장한다. 연타해도 룩은 하나다 */
export async function keepJob(jobId: string): Promise<boolean> {
  const token = await sessionToken();
  if (!token) return false;
  const { items } = await loadJobItems(jobId);
  const result = await apiRequest(`/v1/generation-jobs/${encodeURIComponent(jobId)}/keep`, {
    method: "POST",
    token,
    body: {
      wornItems: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        closet: item.closet,
      })),
    },
  });
  if (result.ok) await forgetJob(jobId);
  return result.ok;
}

/** 저장했거나 지운 작업은 기기 요청 줄을 지운다. 저장 안 한 결과 찾기에서 빠진다 */
async function forgetJob(jobId: string): Promise<void> {
  const { db } = await getDeviceDb();
  await deleteGenerationRequestByJob(db, jobId);
}

/** 다 만들었지만 저장도 「나가기」 도 하지 않은 결과. 무대의 「다 된 완성 룩 보기」 가 연다 */
export async function findUnsavedJob(): Promise<string | null> {
  if (!(await sessionToken())) return null;
  const { db } = await getDeviceDb();
  return latestUnsavedJobId(db);
}

export interface FinishedJob {
  jobId: string;
  status: string;
}

/**
 * 작업 감시 한 번. 응답을 못 받은 요청은 요청 ID 로 묻고, 끝나지 않은 작업은 상태를 묻는다.
 * 끝났는데 아직 알리지 않은 작업을 돌려준다. 알릴지와 봤다는 표시는 부르는 쪽이 정한다.
 */
export async function pollWatchedJobs(): Promise<FinishedJob[]> {
  const token = await sessionToken();
  if (!token) return [];
  const { db } = await getDeviceDb();
  const finished: FinishedJob[] = [];
  for (const request of await listWatchedRequests(db)) {
    if (!request.jobId) {
      if (inFlight.has(request.requestId)) continue;
      const found = await byRequest(token, request.requestId);
      if (found.ok) {
        await attachGenerationJob(db, request.requestId, found.data.jobId, found.data.status);
      } else if (found.status === 404) {
        // 서버가 받지 못한 요청이다. 골드도 묶이지 않았다.
        await deleteGenerationRequest(db, request.requestId);
      }
      continue;
    }
    let status = request.status;
    if (!isFinishedStatus(status)) {
      const loaded = await loadJob(request.jobId);
      if (loaded.kind === "missing") {
        await deleteGenerationRequest(db, request.requestId);
        continue;
      }
      if (loaded.kind === "error") continue;
      status = loaded.job.status;
    }
    if (isFinishedStatus(status) && !request.seen) finished.push({ jobId: request.jobId, status });
  }
  return finished;
}

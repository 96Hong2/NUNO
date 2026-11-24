import type { Migration, SqlExecutor } from "@nuno/device-db";
import type { GenerationManifest } from "../domain";

/**
 * 생성 요청 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다.
 * 요청 ID 를 보내기 전에 적어 두어, 응답을 받기 전에 앱이 꺼져도 같은 ID 로 다시 묻는다.
 * 결과 화면이 입은 옷을 보이도록 보낸 입력 목록도 함께 둔다.
 */
export const createGenerationRequestTable: Omit<Migration, "version"> = {
  name: "create-generation-requests",
  async up(tx) {
    await tx.exec(`CREATE TABLE generation_requests (
      request_id TEXT PRIMARY KEY,
      outfit_key TEXT NOT NULL,
      manifest TEXT NOT NULL,
      job_id TEXT UNIQUE,
      status TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
  },
};

/** 접수 응답을 받기 전 상태. 받은 뒤에는 서버 작업 상태를 그대로 적는다. */
const SENDING_STATUS = "sending";

interface GenerationRequest {
  requestId: string;
  outfitKey: string;
  manifest: GenerationManifest;
  jobId: string | null;
  status: string;
  /** 끝난 작업을 사용자가 봤거나 알림을 띄웠다 */
  seen: boolean;
  createdAt: string;
}

interface RequestRow {
  request_id: string;
  outfit_key: string;
  manifest: string;
  job_id: string | null;
  status: string;
  seen: number;
  created_at: string;
}

const COLUMNS = "request_id, outfit_key, manifest, job_id, status, seen, created_at";

function toRequest(row: RequestRow): GenerationRequest {
  return {
    requestId: row.request_id,
    outfitKey: row.outfit_key,
    manifest: JSON.parse(row.manifest) as GenerationManifest,
    jobId: row.job_id,
    status: row.status,
    seen: row.seen === 1,
    createdAt: row.created_at,
  };
}

/** 보내기 전에 요청을 적는다. */
export async function insertGenerationRequest(
  db: SqlExecutor,
  request: { requestId: string; outfitKey: string; manifest: GenerationManifest },
  now: string,
): Promise<void> {
  await db.run(
    "INSERT INTO generation_requests (request_id, outfit_key, manifest, status, created_at) VALUES (?, ?, ?, ?, ?)",
    [request.requestId, request.outfitKey, JSON.stringify(request.manifest), SENDING_STATUS, now],
  );
}

/** 접수 응답(또는 요청 ID 조회)으로 받은 작업 ID 와 상태를 적는다. */
export async function attachGenerationJob(
  db: SqlExecutor,
  requestId: string,
  jobId: string,
  status: string,
): Promise<void> {
  await db.run("UPDATE generation_requests SET job_id = ?, status = ? WHERE request_id = ?", [
    jobId,
    status,
    requestId,
  ]);
}

export async function updateGenerationStatus(
  db: SqlExecutor,
  jobId: string,
  status: string,
): Promise<void> {
  await db.run("UPDATE generation_requests SET status = ? WHERE job_id = ?", [status, jobId]);
}

/** 끝난 작업을 봤다고 적는다. 작업 감시가 같은 작업을 두 번 알리지 않는다. */
export async function markGenerationSeen(db: SqlExecutor, jobId: string): Promise<void> {
  await db.run("UPDATE generation_requests SET seen = 1 WHERE job_id = ?", [jobId]);
}

export async function deleteGenerationRequest(db: SqlExecutor, requestId: string): Promise<void> {
  await db.run("DELETE FROM generation_requests WHERE request_id = ?", [requestId]);
}

/** 결과를 룩북에 저장했거나 「나가기」 로 지웠다. 그 작업 줄을 지운다. */
export async function deleteGenerationRequestByJob(db: SqlExecutor, jobId: string): Promise<void> {
  await db.run("DELETE FROM generation_requests WHERE job_id = ?", [jobId]);
}

/** 다 만들었지만 아직 저장하지도 지우지도 않은 작업 가운데 가장 최근 것 */
export async function latestUnsavedJobId(db: SqlExecutor): Promise<string | null> {
  const row = await db.get<{ job_id: string }>(
    "SELECT job_id FROM generation_requests WHERE status = 'succeeded' ORDER BY created_at DESC LIMIT 1",
  );
  return row?.job_id ?? null;
}

/** 로그아웃과 계정 바꾸기: 이 기기의 생성 요청을 모두 지운다. */
export async function deleteAllGenerationRequests(db: SqlExecutor): Promise<void> {
  await db.run("DELETE FROM generation_requests");
}

export async function readGenerationRequestByJob(
  db: SqlExecutor,
  jobId: string,
): Promise<GenerationRequest | null> {
  const row = await db.get<RequestRow>(
    `SELECT ${COLUMNS} FROM generation_requests WHERE job_id = ?`,
    [jobId],
  );
  return row ? toRequest(row) : null;
}

/** 같은 코디로 보냈지만 접수 응답을 받지 못한 요청. 가장 최근 것 하나다. */
export async function findUnansweredRequest(
  db: SqlExecutor,
  outfitKey: string,
): Promise<GenerationRequest | null> {
  const row = await db.get<RequestRow>(
    `SELECT ${COLUMNS} FROM generation_requests WHERE outfit_key = ? AND job_id IS NULL ORDER BY created_at DESC LIMIT 1`,
    [outfitKey],
  );
  return row ? toRequest(row) : null;
}

/** 작업 감시가 물을 요청: 응답을 못 받은 것과 아직 끝나지 않았거나 알리지 않은 것 */
export async function listWatchedRequests(db: SqlExecutor): Promise<GenerationRequest[]> {
  const rows = await db.all<RequestRow>(
    `SELECT ${COLUMNS} FROM generation_requests
     WHERE job_id IS NULL OR status NOT IN ('succeeded', 'failed') OR seen = 0
     ORDER BY created_at`,
  );
  return rows.map(toRequest);
}

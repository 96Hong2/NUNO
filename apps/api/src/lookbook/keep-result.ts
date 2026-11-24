import type { SqlClient } from "../db/sql-client.ts";
import type { ResultStore } from "../generation/ports.ts";

/** 저장한 결과 사진 자리. gen30 의 30일 규칙에서 빠진다. */
export const keptResultKey = (userId: string, resultId: string) =>
  `u/${userId}/looks/${resultId}.jpg`;

/**
 * 「내 룩북에 저장」. 파일을 저장 자리로 복사하고, DB 에 저장으로 적은 뒤 gen30 파일을 지운다.
 * 연타해도 룩은 하나다. 주인이 다르거나 끝나지 않았거나 지운 결과면 null.
 */
export async function keepResult(
  db: SqlClient,
  store: ResultStore,
  userId: string,
  jobId: string,
  wornItems: unknown[],
  now: Date,
): Promise<string | null> {
  const [result] = await db.query<{ id: string; r2_key: string; storage_state: string }>(
    `SELECT r.id, r.r2_key, r.storage_state
     FROM generation_results r JOIN generation_jobs j ON j.id = r.job_id
     WHERE r.job_id = $1 AND r.user_id = $2 AND j.status = 'succeeded'`,
    [jobId, userId],
  );
  if (!result || result.storage_state === "deleted") return null;

  const keptKey = keptResultKey(userId, result.id);
  let moving = result.storage_state === "gen30";
  if (moving) {
    const copied = await store.copy(result.r2_key, keptKey).then(
      () => true,
      () => false,
    );
    if (!copied) {
      // 연타한 다른 요청이 먼저 옮겼으면 그 저장을 쓴다. 「나가기」 로 지워졌으면 저장하지 않는다.
      const [again] = await db.query<{ storage_state: string }>(
        "SELECT storage_state FROM generation_results WHERE id = $1 AND user_id = $2",
        [result.id, userId],
      );
      if (again?.storage_state !== "kept") return null;
      moving = false;
    }
  }

  const [row] = await db.query<{ look_id: string | null }>(
    "SELECT nuno_keep_result($1, $2, $3, $4, $5) AS look_id",
    [userId, jobId, keptKey, JSON.stringify(wornItems), now],
  );
  const lookId = row?.look_id ?? null;
  if (!lookId) {
    if (moving) await store.remove(keptKey);
    return null;
  }
  if (moving && result.r2_key !== keptKey) await store.remove(result.r2_key);
  return lookId;
}

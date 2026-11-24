import { runMigrations } from "@nuno/device-db";
import { openNodeSqliteDatabase, type NodeSqliteDatabase } from "@nuno/device-db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest } from "../domain";
import {
  attachGenerationJob,
  createGenerationRequestTable,
  findUnansweredRequest,
  insertGenerationRequest,
  listWatchedRequests,
  markGenerationSeen,
  updateGenerationStatus,
} from "./request-store";

let db: NodeSqliteDatabase;
beforeEach(async () => {
  db = openNodeSqliteDatabase();
  await runMigrations(db, [{ version: 1, ...createGenerationRequestTable }], {
    versionTable: "schema_migrations",
  });
});
afterEach(() => db.close());

const manifest = buildManifest("harin", [
  {
    id: "s:w18",
    name: "아이보리 케이프 벨티드 코트",
    category: "outer",
    closet: null,
    imageHash: "",
  },
]);

describe("생성 요청 표", () => {
  it("응답을 못 받은 요청은 다시 물을 수 있고, 끝나고 본 작업은 감시에서 빠진다", async () => {
    await insertGenerationRequest(
      db,
      { requestId: "req-00001", outfitKey: "k", manifest },
      "2026-11-25T01:00:00.000Z",
    );
    expect((await findUnansweredRequest(db, "k"))?.requestId).toBe("req-00001");

    await attachGenerationJob(db, "req-00001", "job-1", "queued");
    expect(await findUnansweredRequest(db, "k")).toBeNull();
    expect((await listWatchedRequests(db)).map((row) => row.jobId)).toEqual(["job-1"]);

    await updateGenerationStatus(db, "job-1", "succeeded");
    expect((await listWatchedRequests(db)).map((row) => row.jobId)).toEqual(["job-1"]);
    await markGenerationSeen(db, "job-1");
    expect(await listWatchedRequests(db)).toEqual([]);
  });
});

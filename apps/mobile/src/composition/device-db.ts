import { runMigrations, type SqlDatabase } from "@nuno/device-db";
import { EXPO_SQLITE_ADAPTER_NAME, openExpoSqliteDatabase } from "../adapters/expo-sqlite";
import { MIGRATIONS, VERSION_TABLE } from "./migrations";

const DATABASE_NAME = "nuno.db";

export interface DeviceDb {
  /** 「저장소 보기」 에 보이는 어댑터 이름 */
  adapterName: string;
  db: SqlDatabase;
  /** 옮기기를 마친 뒤의 판 번호 */
  schemaVersion: number;
}

let connecting: Promise<SqlDatabase> | undefined;
let ready: Promise<DeviceDb> | undefined;

/**
 * 앱 전체가 나눠 쓰는 기기 DB 연결 하나. 처음 부를 때 열고 판을 옮긴다.
 * 열기에 실패하면(다른 탭이 OPFS 를 잠근 때 등) 연결 기억을 비워 다음 호출이 다시 연다.
 * 옮기기에 실패하면 옮기기 기억만 비운다. 웹에서 다시 열면 열린 첫 연결이 OPFS 를 잡고 있어서다.
 */
export function getDeviceDb(): Promise<DeviceDb> {
  connecting ??= openExpoSqliteDatabase(DATABASE_NAME).catch((error: unknown) => {
    connecting = undefined;
    throw error;
  });
  ready ??= connecting
    .then(async (db) => {
      const report = await runMigrations(db, MIGRATIONS, { versionTable: VERSION_TABLE });
      return { adapterName: EXPO_SQLITE_ADAPTER_NAME, db, schemaVersion: report.to };
    })
    .catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
  return ready;
}

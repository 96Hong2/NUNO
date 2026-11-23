import type { SqlDatabase } from "@nuno/device-db";
import { EXPO_SQLITE_ADAPTER_NAME, openExpoSqliteDatabase } from "../adapters/expo-sqlite";

const DATABASE_NAME = "nuno.db";

export interface DeviceDb {
  /** 「저장소 보기」 에 보이는 어댑터 이름 */
  adapterName: string;
  db: SqlDatabase;
}

let opening: Promise<DeviceDb> | undefined;

/** 앱 전체가 나눠 쓰는 기기 DB 연결 하나. 처음 부를 때 연다. */
export function getDeviceDb(): Promise<DeviceDb> {
  opening ??= openExpoSqliteDatabase(DATABASE_NAME).then((db) => ({
    adapterName: EXPO_SQLITE_ADAPTER_NAME,
    db,
  }));
  return opening;
}

import {
  createSerialQueue,
  type SqlDatabase,
  type SqlExecutor,
  type SqlValue,
} from "@nuno/device-db";
import { openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from "expo-sqlite";

export const EXPO_SQLITE_ADAPTER_NAME = "expo-sqlite";

/**
 * expo-sqlite 로 `SqlDatabase` 를 구현한다. 웹에서는 expo-sqlite 가 wa-sqlite 로 OPFS 에 저장한다.
 * 연결 하나를 줄 세워 쓴다. withTransactionAsync 는 그 사이에 든 다른 작업도 트랜잭션에 넣기 때문이다.
 * 웹은 배타 트랜잭션(withExclusiveTransactionAsync)을 받지 않아 모든 곳에서 withTransactionAsync 를 쓴다.
 */
export async function openExpoSqliteDatabase(name: string): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(name);
  const queue = createSerialQueue();
  const direct = directExecutor(db);

  return {
    exec: (sql) => queue.run(() => direct.exec(sql)),
    run: (sql, params) => queue.run(() => direct.run(sql, params)),
    all: <Row>(sql: string, params?: readonly SqlValue[]) =>
      queue.run(() => direct.all<Row>(sql, params)),
    get: <Row>(sql: string, params?: readonly SqlValue[]) =>
      queue.run(() => direct.get<Row>(sql, params)),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      queue.run(async () => {
        let result: T | undefined;
        await db.withTransactionAsync(async () => {
          result = await work(direct);
        });
        return result as T;
      }),
  };
}

function directExecutor(db: SQLiteDatabase): SqlExecutor {
  const bind = (params: readonly SqlValue[] = []): SQLiteBindValue[] => [...params];
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const result = await db.runAsync(sql, bind(params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: <Row>(sql: string, params?: readonly SqlValue[]) => db.getAllAsync<Row>(sql, bind(params)),
    get: async <Row>(sql: string, params?: readonly SqlValue[]) =>
      (await db.getFirstAsync<Row>(sql, bind(params))) ?? undefined,
  };
}

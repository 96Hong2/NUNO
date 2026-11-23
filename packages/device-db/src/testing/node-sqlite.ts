/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createSerialQueue, type SqlDatabase, type SqlExecutor, type SqlValue } from "../domain";

export interface NodeSqliteDatabase extends SqlDatabase {
  close(): void;
}

/**
 * 시험에서만 쓰는 기기 DB. Node 내장 SQLite 로 `SqlDatabase` 계약을 그대로 지킨다.
 * 앱 어댑터(expo-sqlite)와 같은 순서 보장을 하므로 옮기기 실행기 시험이 이것으로 돈다.
 */
export function openNodeSqliteDatabase(path = ":memory:"): NodeSqliteDatabase {
  const db = new DatabaseSync(path);
  const queue = createSerialQueue();
  const bind = (params: readonly SqlValue[] = []): SQLInputValue[] => [...params];

  const direct: SqlExecutor = {
    exec: (sql) => {
      db.exec(sql);
      return Promise.resolve();
    },
    run: (sql, params) => {
      const result = db.prepare(sql).run(...bind(params));
      return Promise.resolve({
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      });
    },
    all: <Row>(sql: string, params?: readonly SqlValue[]) =>
      Promise.resolve(db.prepare(sql).all(...bind(params)) as Row[]),
    get: <Row>(sql: string, params?: readonly SqlValue[]) =>
      Promise.resolve(db.prepare(sql).get(...bind(params)) as Row | undefined),
  };

  return {
    exec: (sql) => queue.run(() => direct.exec(sql)),
    run: (sql, params) => queue.run(() => direct.run(sql, params)),
    all: <Row>(sql: string, params?: readonly SqlValue[]) =>
      queue.run(() => direct.all<Row>(sql, params)),
    get: <Row>(sql: string, params?: readonly SqlValue[]) =>
      queue.run(() => direct.get<Row>(sql, params)),
    transaction: (work) =>
      queue.run(async () => {
        db.exec("BEGIN");
        try {
          const result = await work(direct);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          // SQLite 가 이미 되돌렸으면(RAISE(ROLLBACK) 등) ROLLBACK 이 실패한다. 원래 오류를 남긴다.
          if (db.isTransaction) db.exec("ROLLBACK");
          throw error;
        }
      }),
    close: () => db.close(),
  };
}

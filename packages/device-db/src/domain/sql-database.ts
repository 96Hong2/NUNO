/** 기기 DB 에 넣고 읽는 값. SQLite 의 TEXT, INTEGER/REAL, NULL, BLOB 에 맞는다. */
export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  /** 바뀐 행 수 */
  changes: number;
  lastInsertRowId: number;
}

/** 문장 하나씩 돌리는 면. 트랜잭션 안에서 받는 `tx` 도 이 모양이다. */
export interface SqlExecutor {
  /** 값 없는 문장 여럿(표 만들기 등)을 한 번에 돈다. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;
  /** 첫 행. 없으면 undefined. */
  get<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row | undefined>;
}

/**
 * 기기 DB 포트. 실제 구현은 앱 어댑터(expo-sqlite), 시험 대역은 `@nuno/device-db/testing` 에 있다.
 *
 * 계약
 * - 연결 하나에서 작업을 들어온 순서대로 하나씩 돌린다.
 * - `transaction` 이 도는 동안 밖에서 부른 작업은 트랜잭션이 끝날 때까지 기다린다.
 * - `work` 가 던지면 되돌리고 같은 오류를 다시 던진다.
 * - `work` 안에서는 받은 `tx` 만 쓴다. 바깥 db 의 작업이나 `transaction` 을 부르면
 *   지금 트랜잭션 뒤에 줄을 서서 영원히 기다리고, 그 뒤 연결 전체가 멈춘다.
 */
export interface SqlDatabase extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

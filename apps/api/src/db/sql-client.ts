/** API 가 쓰는 SQL 면. 실제 구현은 `adapters/postgres.ts` 다. */
export interface SqlClient {
  query<Row>(text: string, params?: readonly unknown[]): Promise<Row[]>;
  /** 한 연결에서 BEGIN 과 COMMIT 사이에 work 를 돌린다. 던지면 되돌린다. */
  transaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

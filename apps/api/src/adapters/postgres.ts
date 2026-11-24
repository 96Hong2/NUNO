import pg from "pg";
import type { SqlClient } from "../db/sql-client.ts";

/** `pg` 연결 풀로 `SqlClient` 를 만든다. 주소와 비밀번호는 환경 변수로만 받는다. */
export function openPostgres(connectionString: string, max = 5): SqlClient {
  const pool = new pg.Pool({ connectionString, max });
  const client = (run: pg.Pool | pg.PoolClient): SqlClient => ({
    async query<Row>(text: string, params: readonly unknown[] = []) {
      const result = await run.query(text, [...params]);
      return result.rows as Row[];
    },
    transaction: () => Promise.reject(new Error("트랜잭션 안에서 트랜잭션을 열지 않는다")),
    close: () => Promise.resolve(),
  });
  return {
    ...client(pool),
    async transaction<T>(work: (tx: SqlClient) => Promise<T>) {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await work(client(connection));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  };
}

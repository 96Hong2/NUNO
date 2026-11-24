import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SqlClient } from "./sql-client.ts";

/** 판 옮기기 SQL 파일 폴더. 파일 이름은 `<네 자리 판 번호>_<이름>.sql` 이다. */
export const MIGRATIONS_DIR = new URL("../../db/migrations", import.meta.url).pathname;

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface MigrationReport {
  from: number;
  to: number;
}

/**
 * 아직 적용하지 않은 판을 차례로 적용한다. 판마다 트랜잭션 하나이고, 표는 nuno_owner 가 갖는다.
 * 관리자 계정(nuno_owner 의 구성원)으로 부른다. main 에 머지된 판 파일은 고치지 않는다.
 */
export async function migrate(db: SqlClient, dir = MIGRATIONS_DIR): Promise<MigrationReport> {
  await db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE nuno_owner");
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await tx.query("GRANT SELECT ON schema_migrations TO nuno_api");
  });
  const from = await schemaVersion(db);
  const files = (await readdir(dir)).filter((name) => FILE.test(name)).sort();
  let to = from;
  for (const name of files) {
    const [, number, label] = FILE.exec(name) ?? [];
    const version = Number(number);
    if (version <= from) continue;
    if (version !== to + 1) throw new Error(`판 번호가 이어지지 않는다: ${to} 다음이 ${version}`);
    const sql = await readFile(join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE nuno_owner");
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        version,
        label,
      ]);
    });
    to = version;
  }
  return { from, to };
}

/** 적용한 마지막 판 번호. 판 표가 없으면 0. */
export async function schemaVersion(db: SqlClient): Promise<number> {
  const [row] = await db.query<{ version: number | null }>(
    "SELECT max(version) AS version FROM schema_migrations",
  );
  return row?.version ?? 0;
}

import {
  assertSqlIdentifier,
  pendingMigrations,
  type Migration,
  type SqlDatabase,
  type SqlExecutor,
} from "../domain";

export interface MigrationOptions {
  /** 적용한 판 번호를 적는 표 이름. T2-1 부터 `schema_migrations` 를 쓴다. */
  versionTable: string;
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: readonly number[];
}

/**
 * 판 목록을 지금 판 다음부터 차례로 적용한다.
 * 판마다 트랜잭션 하나에서 단계와 판 번호 기록을 함께 하므로, 실패한 판은 남지 않는다.
 * 트랜잭션 안에서 판 번호를 다시 읽어, 같은 연결에서 동시에 불러도 한 판을 두 번 적용하지 않는다.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[],
  { versionTable }: MigrationOptions,
): Promise<MigrationReport> {
  assertSqlIdentifier(versionTable);
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${versionTable} (version INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
  );
  const currentVersion = async (sql: SqlExecutor) =>
    (await sql.get<{ version: number | null }>(`SELECT MAX(version) AS version FROM ${versionTable}`))
      ?.version ?? 0;
  const from = await currentVersion(db);
  const applied: number[] = [];
  for (const migration of pendingMigrations(migrations, from)) {
    const done = await db.transaction(async (tx) => {
      if ((await currentVersion(tx)) >= migration.version) return false;
      await migration.up(tx);
      await tx.run(`INSERT INTO ${versionTable} (version, name) VALUES (?, ?)`, [
        migration.version,
        migration.name,
      ]);
      return true;
    });
    if (done) applied.push(migration.version);
  }
  return { from, to: await currentVersion(db), applied };
}

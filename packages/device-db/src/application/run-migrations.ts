import {
  assertSqlIdentifier,
  pendingMigrations,
  type Migration,
  type SqlDatabase,
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
  const row = await db.get<{ version: number | null }>(
    `SELECT MAX(version) AS version FROM ${versionTable}`,
  );
  const from = row?.version ?? 0;
  const applied: number[] = [];
  for (const migration of pendingMigrations(migrations, from)) {
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run(`INSERT INTO ${versionTable} (version, name) VALUES (?, ?)`, [
        migration.version,
        migration.name,
      ]);
    });
    applied.push(migration.version);
  }
  return { from, to: from + applied.length, applied };
}

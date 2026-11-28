import type { SqlExecutor } from "./sql-database";

/** 판 하나로 옮기는 단계. 표를 가진 컨텍스트가 내고, 순서는 앱 composition 이 정한다. */
export interface Migration {
  /** 1 부터 하나씩 늘어나는 판 번호 */
  version: number;
  name: string;
  up(tx: SqlExecutor): Promise<void>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** SQL 에 그대로 넣는 표 이름이 영문자, 숫자, _ 만인지 본다. */
export function assertSqlIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new RangeError(`표 이름은 영문자, 숫자, _ 만 쓴다: ${JSON.stringify(name)}`);
  }
}

/**
 * 판 목록이 1, 2, 3 처럼 빈칸 없이 이어지는지 본다.
 * 어기면 앱을 만들 때 고칠 실수라서 바로 던진다.
 */
export function assertMigrationChain(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new RangeError(
        `판 번호는 1 부터 빈칸 없이 이어져야 한다: ${index + 1} 번째 자리에 판 ${migration.version}`,
      );
    }
  });
}

/** 지금 판 다음부터 돌릴 단계. 기기 판이 앱이 아는 마지막 판보다 높으면 던진다. */
export function pendingMigrations(
  migrations: readonly Migration[],
  currentVersion: number,
): readonly Migration[] {
  assertMigrationChain(migrations);
  if (currentVersion > migrations.length) {
    throw new RangeError(
      `이 기기에 저장된 자료의 버전(${currentVersion})이 이 앱이 읽을 수 있는 버전(${migrations.length})보다 높아요. 앱을 최신 버전으로 업데이트해 주세요.`,
    );
  }
  return migrations.slice(currentVersion);
}

import { systemClock } from "../adapters/system-clock";
import { getDeviceDb } from "./device-db";

// 「저장소 보기」 전용. dev_probe 는 판 사슬에 넣지 않는 개발용 표다.
const CREATE_DEV_PROBE =
  "CREATE TABLE IF NOT EXISTS dev_probe (key TEXT PRIMARY KEY, value TEXT NOT NULL, written_at TEXT)";

export interface DevProbeRow {
  key: string;
  value: string;
  written_at: string | null;
}

export interface TableRowCount {
  name: string;
  rows: number;
}

export interface DevStorageSnapshot {
  adapterName: string;
  probes: DevProbeRow[];
  tables: TableRowCount[];
}

export async function readDevStorage(): Promise<DevStorageSnapshot> {
  const { adapterName, db } = await getDeviceDb();
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const counts: TableRowCount[] = [];
  for (const { name } of tables) {
    const row = await db.get<{ rows: number }>(`SELECT COUNT(*) AS rows FROM "${name}"`);
    counts.push({ name, rows: row?.rows ?? 0 });
  }
  const hasProbe = tables.some((table) => table.name === "dev_probe");
  const probes = hasProbe
    ? await db.all<DevProbeRow>("SELECT key, value, written_at FROM dev_probe ORDER BY written_at")
    : [];
  return { adapterName, probes, tables: counts };
}

/** 「시험 값 쓰기」: dev_probe 에 지금 시각을 키로 한 줄을 쓴다. */
export async function writeDevProbe(): Promise<void> {
  const { db } = await getDeviceDb();
  const writtenAt = systemClock.now().toISOString();
  await db.exec(CREATE_DEV_PROBE);
  await db.run("INSERT INTO dev_probe (key, value, written_at) VALUES (?, ?, ?)", [
    `probe-${writtenAt}`,
    "시험 값",
    writtenAt,
  ]);
}

export interface ConstraintCheck {
  label: string;
  blocked: boolean;
  message: string;
}

/** 「제약 확인」: 같은 키 두 번, value 에 NULL 을 넣어 보고 막혔는지 낸다. 쓴 줄은 지운다. */
export async function checkDevProbeConstraints(): Promise<ConstraintCheck[]> {
  const { db } = await getDeviceDb();
  await db.exec(CREATE_DEV_PROBE);
  const key = `constraint-${systemClock.now().toISOString()}`;
  const attempt = async (label: string, sql: string, params: (string | null)[]) => {
    try {
      await db.run(sql, params);
      return { label, blocked: false, message: "들어갔다" };
    } catch (error) {
      return {
        label,
        blocked: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
  await db.run("INSERT INTO dev_probe (key, value) VALUES (?, ?)", [key, "첫 값"]);
  const results = [
    await attempt("같은 키 두 번", "INSERT INTO dev_probe (key, value) VALUES (?, ?)", [
      key,
      "둘째 값",
    ]),
    await attempt("value 에 NULL", "INSERT INTO dev_probe (key, value) VALUES (?, ?)", [
      `${key}-null`,
      null,
    ]),
  ];
  await db.run("DELETE FROM dev_probe WHERE key LIKE ?", [`${key}%`]);
  return results;
}

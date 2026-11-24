import { readProfile } from "@nuno/profile";
import { readTwinChoice } from "@nuno/twin";
import { systemClock } from "../adapters/system-clock";
import { getDeviceDb } from "./device-db";

// 「저장소 보기」 전용 개발용 예외다. 컨텍스트 표의 SQL 은 그 패키지 application 에 두므로 본보기로 쓰지 않는다.
// dev_probe 는 판 사슬에 넣지 않는 개발용 표다.
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

/** 「저장소 보기」 의 「저장한 값」 한 줄. 값이 없으면 null. */
export interface SavedValue {
  label: string;
  value: string | null;
}

export interface DevStorageSnapshot {
  adapterName: string;
  schemaVersion: number;
  saved: SavedValue[];
  probes: DevProbeRow[];
  tables: TableRowCount[];
}

export async function readDevStorage(): Promise<DevStorageSnapshot> {
  const { adapterName, db, schemaVersion } = await getDeviceDb();
  const profile = await readProfile(db);
  const saved: SavedValue[] = [
    { label: "생년월일", value: profile.birthDate },
    { label: "트윈 ID", value: await readTwinChoice(db) },
    {
      label: "스타일 태그",
      value: profile.styleTags.length > 0 ? profile.styleTags.join(", ") : null,
    },
  ];
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
  return { adapterName, schemaVersion, saved, probes, tables: counts };
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

/**
 * 「제약 확인」: 같은 키 두 번, value 에 NULL 을 넣어 보고 막혔는지 낸다.
 * 중간에 던진 트랜잭션은 안에서 쓴 줄이 되돌려지고, 그동안 밖에서 쓴 줄은 남는지 본다. 쓴 줄은 지운다.
 */
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
  const inside = `${key}-tx-inside`;
  const outside = `${key}-tx-outside`;
  const failing = db.transaction(async (tx) => {
    await tx.run("INSERT INTO dev_probe (key, value) VALUES (?, ?)", [inside, "안 값"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error("중간 실패");
  });
  const outsideWrite = db.run("INSERT INTO dev_probe (key, value) VALUES (?, ?)", [
    outside,
    "밖 값",
  ]);
  const thrown = await failing.then(
    () => false,
    () => true,
  );
  await outsideWrite;
  const count = async (k: string) =>
    (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM dev_probe WHERE key = ?", [k]))?.n ?? 0;
  const insideRows = await count(inside);
  const outsideRows = await count(outside);
  results.push({
    label: "중간에 실패한 트랜잭션",
    blocked: thrown && insideRows === 0 && outsideRows === 1,
    message: `안 ${insideRows}줄, 밖 ${outsideRows}줄`,
  });
  await db.run("DELETE FROM dev_probe WHERE key LIKE ?", [`${key}%`]);
  return results;
}

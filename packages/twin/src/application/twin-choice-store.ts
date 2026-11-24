import type { Migration, SqlExecutor } from "@nuno/device-db";
import { DEFAULT_PRESET_TWIN, isPresetTwinKey, type PresetTwinKey } from "../domain";

/** 고른 트윈 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다. */
export const createTwinChoiceTable: Omit<Migration, "version"> = {
  name: "create-twin-choice",
  up: (tx) =>
    tx.exec(
      "CREATE TABLE twin_choice (id INTEGER PRIMARY KEY CHECK (id = 1), preset_key TEXT NOT NULL)",
    ),
};

/** 저장한 트윈. 아직 고르지 않았으면 null. */
export async function readTwinChoice(db: SqlExecutor): Promise<PresetTwinKey | null> {
  const row = await db.get<{ preset_key: string }>(
    "SELECT preset_key FROM twin_choice WHERE id = 1",
  );
  return row && isPresetTwinKey(row.preset_key) ? row.preset_key : null;
}

/** 홈 무대에 세울 트윈. 고른 적이 없으면 기본 트윈이다. */
export async function currentTwin(db: SqlExecutor): Promise<PresetTwinKey> {
  return (await readTwinChoice(db)) ?? DEFAULT_PRESET_TWIN;
}

export async function chooseTwin(db: SqlExecutor, key: PresetTwinKey): Promise<void> {
  await db.run(
    "INSERT INTO twin_choice (id, preset_key) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET preset_key = excluded.preset_key",
    [key],
  );
}

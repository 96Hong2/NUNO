import { finishOnboarding } from "@nuno/profile";
import {
  chooseTwin,
  currentTwin,
  DEFAULT_PRESET_TWIN,
  readTwinChoice,
  type PresetTwinKey,
} from "@nuno/twin";
import { getDeviceDb } from "./device-db";

/** 트윈 고르기의 「<이름>으로 시작」. 고른 트윈만 저장하고, 온보딩은 스타일 단계에서 끝난다. */
export async function pickTwin(key: PresetTwinKey): Promise<void> {
  const { db } = await getDeviceDb();
  await chooseTwin(db, key);
}

/**
 * 트윈 고르기의 왼쪽 위 X. 아직 고른 트윈이 없으면 기본 트윈을 저장하고 온보딩을 끝낸다.
 * 스타일 단계에서 뒤로 와 X 를 누르면 이미 고른 트윈을 그대로 둔다.
 * 두 컨텍스트의 쓰기를 트랜잭션 하나로 묶어 반만 저장되지 않게 한다.
 */
export async function skipTwinPick(): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction(async (tx) => {
    if ((await readTwinChoice(tx)) === null) await chooseTwin(tx, DEFAULT_PRESET_TWIN);
    await finishOnboarding(tx);
  });
}

export async function loadCurrentTwin(): Promise<PresetTwinKey> {
  const { db } = await getDeviceDb();
  return currentTwin(db);
}

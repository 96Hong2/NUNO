import { finishOnboarding } from "@nuno/profile";
import { chooseTwin, currentTwin, DEFAULT_PRESET_TWIN, type PresetTwinKey } from "@nuno/twin";
import { getDeviceDb } from "./device-db";

/**
 * 트윈 고르기의 「<이름>으로 시작」. 고른 트윈을 저장하고 온보딩을 끝낸다.
 * 두 컨텍스트의 쓰기를 트랜잭션 하나로 묶어 반만 저장되지 않게 한다.
 */
export async function startWithTwin(key: PresetTwinKey): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction(async (tx) => {
    await chooseTwin(tx, key);
    await finishOnboarding(tx);
  });
}

/** 트윈 고르기의 왼쪽 위 X. 기본 트윈으로 시작한다. */
export function skipTwinPick(): Promise<void> {
  return startWithTwin(DEFAULT_PRESET_TWIN);
}

export async function loadCurrentTwin(): Promise<PresetTwinKey> {
  const { db } = await getDeviceDb();
  return currentTwin(db);
}

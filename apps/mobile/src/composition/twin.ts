import { finishOnboarding } from "@nuno/profile";
import {
  chooseTwin,
  currentTwin,
  DEFAULT_PRESET_TWIN,
  readTwinChoice,
  type PresetTwinKey,
} from "@nuno/twin";
import { getDeviceDb } from "./device-db";

const twinListeners = new Set<() => void>();

/** 고른 트윈이 바뀌면 부른다. 주소가 그대로인 화면(하단 탭 피팅룸 얼굴 원)이 다시 읽는다 */
export function onTwinChange(listener: () => void): () => void {
  twinListeners.add(listener);
  return () => twinListeners.delete(listener);
}

function twinChanged(): void {
  for (const listener of twinListeners) listener();
}

/** 트윈 고르기의 「<이름>으로 시작」. 고른 트윈만 저장하고, 온보딩은 스타일 단계에서 끝난다. */
export async function pickTwin(key: PresetTwinKey): Promise<void> {
  const { db } = await getDeviceDb();
  await chooseTwin(db, key);
  twinChanged();
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
  twinChanged();
}

/** 홈 「트윈 바꾸기」 시트에서 다른 프리셋을 고를 때. */
export async function switchTwin(key: PresetTwinKey): Promise<void> {
  const { db } = await getDeviceDb();
  await chooseTwin(db, key);
  twinChanged();
}

export async function loadCurrentTwin(): Promise<PresetTwinKey> {
  const { db } = await getDeviceDb();
  return currentTwin(db);
}

import { toKstDateString } from "@nuno/clock";
import {
  finishOnboarding,
  markTourSeen,
  readProfile,
  saveBirthDate,
  saveDisplayName,
  saveStyleTags,
  type ProfileState,
} from "@nuno/profile";
import { systemClock } from "../adapters/system-clock";
import { getDeviceDb } from "./device-db";

/** 오늘 한국 날짜 `YYYY-MM-DD`. 생년월일 칸의 끝 날짜로 쓴다. */
export function todayKst(): string {
  return toKstDateString(systemClock.now());
}

export async function loadProfile(): Promise<ProfileState> {
  const { db } = await getDeviceDb();
  return readProfile(db);
}

export async function submitBirthDate(value: string): Promise<void> {
  const { db } = await getDeviceDb();
  await saveBirthDate(db, value, todayKst());
}

/** 스타일 단계 「건너뛰기」: 태그 없이 온보딩을 끝낸다. 「다음」 과 「나중에 고를게요」 는 3단계로 간다. */
export async function finishStyleStep(): Promise<void> {
  const { db } = await getDeviceDb();
  await finishOnboarding(db);
}

/** 스타일 단계 「다음」: 태그만 저장하고 3단계로 간다. 온보딩은 3단계에서 끝난다. */
export async function saveStyleChoice(tags: readonly string[]): Promise<void> {
  const { db } = await getDeviceDb();
  await saveStyleTags(db, tags);
}

export async function submitDisplayName(value: string): Promise<void> {
  const { db } = await getDeviceDb();
  await saveDisplayName(db, value);
}

/** 처음 둘러보기를 끝까지 넘기거나 닫았을 때. */
export async function completeTour(): Promise<void> {
  const { db } = await getDeviceDb();
  await markTourSeen(db);
}

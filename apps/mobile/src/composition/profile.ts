import { toKstDateString } from "@nuno/clock";
import {
  finishOnboarding,
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

/**
 * 스타일 단계를 끝낸다. tags 가 있으면(「다음」) 함께 저장하고, 없으면(「나중에 고를게요」, 「건너뛰기」) 끝만 적는다.
 */
export async function finishStyleStep(tags: readonly string[] | null): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction(async (tx) => {
    if (tags !== null) await saveStyleTags(tx, tags);
    await finishOnboarding(tx);
  });
}

export async function submitDisplayName(value: string): Promise<void> {
  const { db } = await getDeviceDb();
  await saveDisplayName(db, value);
}

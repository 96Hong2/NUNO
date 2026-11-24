import { toKstDateString } from "@nuno/clock";
import { readProfile, saveBirthDate, type ProfileState } from "@nuno/profile";
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

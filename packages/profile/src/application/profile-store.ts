import type { Migration, SqlExecutor } from "@nuno/device-db";
import { isValidBirthDate, type ProfileState } from "../domain";

/**
 * profile 표를 만드는 옮기기 단계. 판 번호는 앱 composition 의 판 순서가 붙인다.
 * 첫 판에서 T2 가 쓸 칸을 모두 만든다. 칸을 나중에 더하면 판이 늘어난다.
 */
export const createProfileTable: Omit<Migration, "version"> = {
  name: "create-profile",
  async up(tx) {
    await tx.exec(`CREATE TABLE profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      birth_date TEXT,
      display_name TEXT,
      style_tags TEXT NOT NULL DEFAULT '[]',
      onboarding_done INTEGER NOT NULL DEFAULT 0,
      tour_seen INTEGER NOT NULL DEFAULT 0
    )`);
    await tx.run("INSERT INTO profile (id) VALUES (1)");
  },
};

interface ProfileRow {
  birth_date: string | null;
  display_name: string | null;
  style_tags: string;
  onboarding_done: number;
  tour_seen: number;
}

export async function readProfile(db: SqlExecutor): Promise<ProfileState> {
  const row = await db.get<ProfileRow>(
    "SELECT birth_date, display_name, style_tags, onboarding_done, tour_seen FROM profile WHERE id = 1",
  );
  if (!row) throw new Error("profile 표에 행이 없다. 옮기기 단계가 돌았는지 본다");
  return {
    birthDate: row.birth_date,
    displayName: row.display_name,
    styleTags: JSON.parse(row.style_tags) as string[],
    onboardingDone: row.onboarding_done === 1,
    tourSeen: row.tour_seen === 1,
  };
}

/** today 는 한국 날짜 `YYYY-MM-DD`. 받을 수 없는 날짜면 던진다. */
export async function saveBirthDate(db: SqlExecutor, value: string, today: string): Promise<void> {
  if (!isValidBirthDate(value, today)) throw new Error(`받을 수 없는 생년월일: ${value}`);
  await db.run("UPDATE profile SET birth_date = ? WHERE id = 1", [value]);
}

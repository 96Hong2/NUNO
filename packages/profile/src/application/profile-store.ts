import type { Migration, SqlExecutor } from "@nuno/device-db";
import {
  isValidBirthDate,
  normalizeDisplayName,
  STYLE_TAGS,
  STYLE_TAGS_MAX,
  type ProfileState,
} from "../domain";

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

/** 온보딩을 끝냈다고 적는다. 끝까지 했든 건너뛰었든 같다. */
export async function finishOnboarding(db: SqlExecutor): Promise<void> {
  await db.run("UPDATE profile SET onboarding_done = 1 WHERE id = 1");
}

/** today 는 한국 날짜 `YYYY-MM-DD`. 받을 수 없는 날짜면 던진다. */
export async function saveBirthDate(db: SqlExecutor, value: string, today: string): Promise<void> {
  if (!isValidBirthDate(value, today)) throw new Error(`받을 수 없는 생년월일: ${value}`);
  await db.run("UPDATE profile SET birth_date = ? WHERE id = 1", [value]);
}

/** 「이름 정하기」 시트의 「저장」. 받을 수 없는 이름이면 던진다. */
export async function saveDisplayName(db: SqlExecutor, value: string): Promise<void> {
  const name = normalizeDisplayName(value);
  if (name === null) throw new Error("이름은 1~20자로 써 주세요");
  await db.run("UPDATE profile SET display_name = ? WHERE id = 1", [name]);
}

/** 고른 스타일 태그를 저장한다. 목록에 없거나 다섯 개를 넘으면 던진다. */
export async function saveStyleTags(db: SqlExecutor, tags: readonly string[]): Promise<void> {
  const known = tags.every((tag) => (STYLE_TAGS as readonly string[]).includes(tag));
  if (!known || tags.length > STYLE_TAGS_MAX || new Set(tags).size !== tags.length) {
    throw new Error(`저장할 수 없는 스타일 태그: ${tags.join(", ")}`);
  }
  await db.run("UPDATE profile SET style_tags = ? WHERE id = 1", [JSON.stringify(tags)]);
}

import type { Migration } from "@nuno/device-db";
import { createProfileTable } from "@nuno/profile";

/** 기기 DB 판 순서. 각 컨텍스트가 낸 옮기기 단계에 여기서 판 번호를 붙인다. main 에 머지된 판은 고치지 않는다. */
export const MIGRATIONS: Migration[] = [{ version: 1, ...createProfileTable }];

export const VERSION_TABLE = "schema_migrations";

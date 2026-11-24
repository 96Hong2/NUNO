import type { Migration } from "@nuno/device-db";
import { createProfileTable } from "@nuno/profile";
import { createTwinChoiceTable } from "@nuno/twin";
import { createLookTables } from "@nuno/lookbook";
import { addGarmentSampleKey, createGarmentTables } from "@nuno/wardrobe";
import { createOutfitTables } from "@nuno/outfit";
import { createGenerationRequestTable } from "@nuno/generation";

/** 기기 DB 판 순서. 각 컨텍스트가 낸 옮기기 단계에 여기서 판 번호를 붙인다. main 에 머지된 판은 고치지 않는다. */
export const MIGRATIONS: Migration[] = [
  { version: 1, ...createProfileTable },
  { version: 2, ...createTwinChoiceTable },
  { version: 3, ...createGarmentTables },
  { version: 4, ...createOutfitTables },
  { version: 5, ...addGarmentSampleKey },
  { version: 6, ...createLookTables },
  { version: 7, ...createGenerationRequestTable },
];

export const VERSION_TABLE = "schema_migrations";

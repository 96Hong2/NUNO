import type { IdGenerator } from "@nuno/ids";
import { randomUUID } from "expo-crypto";

/** 기기에서 새 ID 를 만든다. Hermes 에 crypto.randomUUID 가 없어 expo-crypto 를 쓴다. */
export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

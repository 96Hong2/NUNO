import type { PresetTwinKey } from "./preset-twin-key";

export type PresetKind = "realistic" | "doll";

export interface PresetTwin {
  key: PresetTwinKey;
  /** 화면에 보이는 이름 */
  name: string;
  kind: PresetKind;
}

/** 트윈 고르기 카드 순서 그대로다. */
export const PRESET_TWINS: readonly PresetTwin[] = [
  { key: "yuna", name: "유나", kind: "realistic" },
  { key: "harin", name: "하린", kind: "realistic" },
  { key: "serin", name: "세린", kind: "realistic" },
  { key: "moa", name: "모아", kind: "doll" },
  { key: "lulu", name: "루루", kind: "doll" },
  { key: "noel", name: "노엘", kind: "doll" },
];

/** 트윈 고르기에서 X 로 건너뛴 사용자의 트윈 */
export const DEFAULT_PRESET_TWIN: PresetTwinKey = "harin";

export function presetTwin(key: PresetTwinKey): PresetTwin {
  const twin = PRESET_TWINS.find((item) => item.key === key);
  if (!twin) throw new Error(`프리셋이 아니다: ${key}`);
  return twin;
}

/** 설치 파일에 든 프리셋 트윈 여섯. 실사 셋(yuna, harin, serin)과 인형 셋(moa, lulu, noel). */
export const PRESET_TWIN_KEYS = ["yuna", "harin", "serin", "moa", "lulu", "noel"] as const;

export type PresetTwinKey = (typeof PRESET_TWIN_KEYS)[number];

/** 저장소나 경로에서 읽은 문자열이 프리셋 키인지 확인한다. */
export function isPresetTwinKey(value: unknown): value is PresetTwinKey {
  return typeof value === "string" && (PRESET_TWIN_KEYS as readonly string[]).includes(value);
}

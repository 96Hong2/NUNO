export const DISPLAY_NAME_MAX = 20;

/** 앞뒤 공백을 뺀 이름. 1~20자가 아니면 null 이다. 글자 수는 이모지도 한 자로 센다. */
export function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim();
  const length = [...trimmed].length;
  return length >= 1 && length <= DISPLAY_NAME_MAX ? trimmed : null;
}

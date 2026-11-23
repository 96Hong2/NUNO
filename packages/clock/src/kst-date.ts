const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 한 순간을 한국 시간대 달력 날짜 `YYYY-MM-DD` 로 바꾼다.
 * 한국은 서머타임이 없어 UTC+9 를 더하는 것으로 충분하다.
 */
export function toKstDateString(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("유효하지 않은 시각이다");
  }
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

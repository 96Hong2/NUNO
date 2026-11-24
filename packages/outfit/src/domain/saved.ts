/** 「내 코디」 칸 수 */
export const SAVED_SLOTS = 5;

/** 비어 있는 첫 칸(1부터). 다 찼으면 null. */
export function firstFreeSlot(usedSlots: readonly number[]): number | null {
  for (let slot = 1; slot <= SAVED_SLOTS; slot += 1) {
    if (!usedSlots.includes(slot)) return slot;
  }
  return null;
}

/** 「11월 25일 코디」. 날짜는 한국 날짜 `YYYY-MM-DD` 로 받는다. */
export function savedOutfitTitle(kstDate: string): string {
  const [, month, day] = kstDate.split("-").map(Number);
  return `${month}월 ${day}일 코디`;
}

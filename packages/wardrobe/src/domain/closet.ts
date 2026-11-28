/** 옷장 두 칸. `mine` 은 「내 옷」(가진 옷), `wanted` 는 「담은 옷」(사고 싶은 옷)이다. */
export type ClosetKey = "mine" | "wanted";

export const CLOSET_LABELS: Record<ClosetKey, string> = { mine: "내 옷", wanted: "담은 옷" };

/** 옷장 기본 칸 수. 「내 옷」 과 「담은 옷」 을 합쳐 센다. */
export const CLOSET_SLOT_LIMIT = 100;

/** 옷 추가 시트와 옷 추가 완료 화면의 「내 옷장 N / 100칸」 */
export function closetSlotsLabel(counts: { mine: number; wanted: number }): string {
  return `내 옷장 ${counts.mine + counts.wanted} / ${CLOSET_SLOT_LIMIT}칸`;
}

export function isClosetKey(value: unknown): value is ClosetKey {
  return value === "mine" || value === "wanted";
}

/** 「이 옷을 가지고 있나요?」 답에 따라 바뀌는 마지막 단추 글자. */
export function saveButtonLabel(closet: ClosetKey): string {
  return `${CLOSET_LABELS[closet]}에 담기`;
}

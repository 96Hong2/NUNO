/** 옷장 두 칸. `mine` 은 「내 옷」(가진 옷), `wanted` 는 「담은 옷」(사고 싶은 옷)이다. */
export type ClosetKey = "mine" | "wanted";

export const CLOSET_LABELS: Record<ClosetKey, string> = { mine: "내 옷", wanted: "담은 옷" };

export function isClosetKey(value: unknown): value is ClosetKey {
  return value === "mine" || value === "wanted";
}

/** 「이 옷, 가지고 있나요?」 답에 따라 바뀌는 마지막 단추 글자. */
export function saveButtonLabel(closet: ClosetKey): string {
  return `${CLOSET_LABELS[closet]}에 담기`;
}

/** 「좋아하는 스타일을 골라 주세요」 의 해시태그 목록. 화면 순서 그대로다. */
export const STYLE_TAGS = [
  "발레코어",
  "블록코어",
  "드뮤어룩",
  "현대코어",
  "무채색",
  "아메카지룩",
  "오피스룩",
  "직장인룩",
  "미니멀룩",
  "꾸안꾸",
  "올드머니",
  "고프코어",
  "캠퍼스룩",
  "러블리",
  "스트릿",
  "빈티지",
  "Y2K",
  "시티보이",
] as const;

export const STYLE_TAGS_MAX = 5;

export type StyleTagToggle =
  { ok: true; selected: string[] } | { ok: false; reason: "max" | "unknown" };

/** 태그 하나를 고르거나 푼다. 다섯 개를 넘기거나 목록에 없는 태그면 바꾸지 않고 까닭을 낸다. */
export function toggleStyleTag(selected: readonly string[], tag: string): StyleTagToggle {
  if (selected.includes(tag)) return { ok: true, selected: selected.filter((t) => t !== tag) };
  if (!(STYLE_TAGS as readonly string[]).includes(tag)) return { ok: false, reason: "unknown" };
  if (selected.length >= STYLE_TAGS_MAX) return { ok: false, reason: "max" };
  return { ok: true, selected: [...selected, tag] };
}

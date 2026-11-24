import type { Outfit, OutfitPiece } from "./outfit";

/** 이름 앞에 오는 종류 순서. 아우터나 상의 하나, 하의나 신발 하나로 짓는다. */
const FIRST = ["outer", "top"] as const;
const SECOND = ["bottom", "shoes", "bag"] as const;

function withAnd(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}와`;
  return code % 28 === 0 ? `${word}와` : `${word}과`;
}

/**
 * 코디 카드 이름. 「차콜 더플 숏코트와 블랙 플리츠 미니스커트」 처럼 두 벌로 짓는다.
 * nameOf 는 옷 이름을 돌려준다. 옷이 없으면 「빈 코디」.
 */
export function outfitTitle(outfit: Outfit, nameOf: (piece: OutfitPiece) => string): string {
  const pick = (categories: readonly string[]) =>
    categories.map((category) => outfit.find((piece) => piece.category === category)).find(Boolean);
  const first = pick(FIRST) ?? outfit[0];
  const second =
    pick(SECOND.filter((category) => category !== first?.category)) ??
    outfit.find((p) => p !== first);
  if (!first) return "빈 코디";
  if (!second) return nameOf(first);
  return `${withAnd(nameOf(first))} ${nameOf(second)}`;
}

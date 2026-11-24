import type { Outfit, OutfitPiece } from "./outfit";
import { lookName } from "./samples";

function withAnd(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}와`;
  return code % 28 === 0 ? `${word}와` : `${word}과`;
}

/**
 * 코디 카드 이름. 추천 코디와 같은 조합이면 그 룩 이름이다.
 * 아니면 아우터나 상의 하나와 하의 하나로 「더플 숏코트와 플리츠 미니」 처럼 짓는다.
 * 둘 가운데 하나만 있으면 그 하나로 짓는다. nameOf 는 옷의 짧은 이름을 돌려준다. 옷이 없으면 「빈 코디」.
 */
export function outfitTitle(outfit: Outfit, nameOf: (piece: OutfitPiece) => string): string {
  const named = lookName(outfit);
  if (named) return named;
  const find = (category: OutfitPiece["category"]) =>
    outfit.find((piece) => piece.category === category);
  const first = find("outer") ?? find("top");
  const second = find("bottom");
  if (first && second) return `${withAnd(nameOf(first))} ${nameOf(second)}`;
  const only = first ?? second ?? outfit[0];
  return only ? nameOf(only) : "빈 코디";
}

import { isWorn, type GarmentRef, type Outfit, type OutfitCategory } from "./outfit";

export interface SuggestCandidate {
  ref: GarmentRef;
  category: OutfitCategory;
}

/** 추천에서 앞에 세우는 종류 순서. 액세서리는 추천하지 않는다. */
const ORDER: OutfitCategory[] = ["outer", "top", "bottom", "shoes", "bag"];
export const MAX_SUGGESTIONS = 4;

/**
 * 무대 「추천 코디」 결과: 지금 입지 않은 종류부터, 종류마다 한 벌씩, 4벌까지 고른다.
 * 이미 입은 옷과 액세서리는 뺀다. seed 를 바꾸면(「다시 추천」) 다른 옷을 고른다.
 */
export function suggestGarments(
  pool: readonly SuggestCandidate[],
  outfit: Outfit,
  seed: number,
): SuggestCandidate[] {
  const wornCategories = new Set(outfit.map((piece) => piece.category));
  const ordered = [
    ...ORDER.filter((c) => !wornCategories.has(c)),
    ...ORDER.filter((c) => wornCategories.has(c)),
  ];
  const picks: SuggestCandidate[] = [];
  for (const category of ordered) {
    const choices = pool.filter((item) => item.category === category && !isWorn(outfit, item.ref));
    if (choices.length === 0) continue;
    const pick = choices[Math.abs(seed) % choices.length];
    if (pick) picks.push(pick);
    if (picks.length >= MAX_SUGGESTIONS) break;
  }
  return picks;
}

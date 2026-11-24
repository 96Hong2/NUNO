import { outfitDiff, sameOutfit, type Outfit } from "./outfit";

/** 「최근 입혀 본 코디」 한 장. 어느 트윈이 입었는지 함께 둔다. */
export interface RecentOutfit {
  id: string;
  twinKey: string;
  outfit: Outfit;
}

/** 모든 트윈을 합쳐 남기는 최근 코디 수 */
export const MAX_RECENT = 12;

/**
 * 옷을 바꿔 입은 뒤의 최근 코디 줄. 맨 앞이 지금 입은 코디다.
 * - 옷이 1벌 이하면 줄을 건드리지 않는다.
 * - 이미 있는 조합이면 그 카드를 맨 앞으로 옮긴다.
 * - 같은 트윈의 맨 앞 카드와 한 벌만 다르면(더하기, 빼기, 한 벌 바꾸기) 맨 앞 카드를 고친다.
 * - 그 밖에는 맨 앞에 새 카드를 더한다. 12장을 넘으면 가장 오래된 것이 빠진다.
 * newId 는 새 카드를 더할 때만 쓴다.
 */
export function recordRecent(
  recents: readonly RecentOutfit[],
  twinKey: string,
  outfit: Outfit,
  newId: string,
): RecentOutfit[] {
  if (outfit.length <= 1) return [...recents];
  const existing = recents.find(
    (item) => item.twinKey === twinKey && sameOutfit(item.outfit, outfit),
  );
  if (existing) return [existing, ...recents.filter((item) => item !== existing)];
  const [front, ...rest] = recents;
  if (front && front.twinKey === twinKey) {
    const { removed, added } = outfitDiff(front.outfit, outfit);
    if (removed <= 1 && added <= 1) return [{ ...front, outfit }, ...rest];
  }
  return [{ id: newId, twinKey, outfit }, ...recents].slice(0, MAX_RECENT);
}

import type { Garment } from "./garment";
import type { Season } from "./garment-attributes";

/** 옷장 「필터」 시트에서 고른 조건. 종류 칩과 따로 걸린다. */
export interface ClosetFilter {
  /** 「즐겨찾기」: 별을 누른 옷만 */
  favoriteOnly: boolean;
  /** 「룩에 안 쓴 옷」: 어느 룩에도 입은 옷으로 들지 않은 옷만 */
  unusedOnly: boolean;
  /** 「계절」: 고른 계절 가운데 하나라도 든 옷만. 비었으면 계절 필터를 적용하지 않는다 */
  seasons: readonly Season[];
}

export const NO_CLOSET_FILTER: ClosetFilter = {
  favoriteOnly: false,
  unusedOnly: false,
  seasons: [],
};

/** 「필터 N」 의 N: 켠 줄 수. 계절은 몇 개를 골라도 한 줄이다. */
export function closetFilterCount(filter: ClosetFilter): number {
  return (
    (filter.favoriteOnly ? 1 : 0) + (filter.unusedOnly ? 1 : 0) + (filter.seasons.length > 0 ? 1 : 0)
  );
}

/**
 * 필터 조건에 맞는 옷만 남긴다. 순서는 그대로다.
 * lookCounts 는 옷 ID 별 룩 수다. 없는 ID 는 0 으로 본다.
 */
export function closetFilter<T extends Pick<Garment, "id" | "isFavorite" | "seasons">>(
  garments: readonly T[],
  filter: ClosetFilter,
  lookCounts: Readonly<Record<string, number>>,
): T[] {
  return garments.filter(
    (garment) =>
      (!filter.favoriteOnly || garment.isFavorite) &&
      (!filter.unusedOnly || (lookCounts[garment.id] ?? 0) === 0) &&
      (filter.seasons.length === 0 ||
        garment.seasons.some((season) => filter.seasons.includes(season))),
  );
}

/**
 * 옷 ID 별로 그 옷을 입은 룩 수를 센다. 인자는 룩마다 입은 옷장 옷 ID 목록이다.
 * 한 룩에 같은 옷이 두 번 적혀 있어도 한 번만 센다.
 */
export function countLooksByGarment(
  lookGarmentIds: readonly (readonly string[])[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ids of lookGarmentIds) {
    for (const id of new Set(ids)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** 「내 옷」 카드 이름 아래 줄 */
export function lookUseLabel(count: number): string {
  return count > 0 ? `룩 ${count}개에 썼어요` : "아직 룩에 안 썼어요";
}

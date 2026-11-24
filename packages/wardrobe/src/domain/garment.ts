import type { ClosetKey } from "./closet";
import {
  defaultGarmentName,
  MEASUREMENT_FIELDS,
  type GarmentCategory,
  type GarmentColor,
  type Season,
  type SizeLabel,
} from "./garment-attributes";
import type { Placement } from "./placement";

/**
 * 누끼를 만든 곳. `vision` 은 아이폰 Apple Vision, `fixture` 는 웹과 시뮬레이터의 미리 만든 그림,
 * `simple` 은 웹에서 사진 네 귀퉁이 색을 배경으로 보고 지운 그림, `none` 은 배경을 지우지 못해 원본을 쓴 그림이다.
 */
export type CutoutSource = "vision" | "fixture" | "simple" | "none";

/** 옷을 넣은 길. `garment_sources.method` 값이다. 견본 옷 담기(`sample`)는 T5 에서 더한다. */
export type GarmentMethod = "camera" | "album";

export interface Garment {
  id: string;
  closet: ClosetKey;
  isFavorite: boolean;
  category: GarmentCategory;
  color: GarmentColor;
  name: string;
  brand: string | null;
  seasons: Season[];
  priceKrw: number | null;
  linkUrl: string | null;
  sizeLabel: SizeLabel | null;
  /** 옷 치수(cm). 키는 화면의 치수 칸 키다. */
  measurements: Record<string, number>;
  /** 비어 있으면 종류별 기본 자리를 쓴다. */
  placement: Placement | null;
  cutoutSource: CutoutSource;
  maskEdited: boolean;
  /** 앱 문서 폴더 기준 상대 경로 */
  originalPath: string;
  cutoutPath: string;
  thumbPath: string;
  createdAt: string;
  updatedAt: string;
}

/** 옷장 칩. 「즐겨찾기 N」, 「전체」, 종류 칩 가운데 하나다. */
export type GarmentFilter =
  { kind: "all" } | { kind: "favorite" } | { kind: "category"; category: GarmentCategory };

export function filterGarments<T extends Pick<Garment, "isFavorite" | "category">>(
  garments: readonly T[],
  filter: GarmentFilter,
): T[] {
  switch (filter.kind) {
    case "all":
      return [...garments];
    case "favorite":
      return garments.filter((garment) => garment.isFavorite);
    case "category":
      return garments.filter((garment) => garment.category === filter.category);
  }
}

/** 사용자가 적은 가격 글자에서 숫자만 읽는다. 비었거나 숫자가 없으면 null. */
export function parsePriceKrw(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** 이름 칸 값. 앞뒤 공백을 빼고, 비었으면 처음 값을 쓴다. 40자에서 자른다. */
export function normalizeGarmentName(text: string, fallback: string): string {
  const trimmed = text.trim();
  return (trimmed === "" ? fallback : trimmed).slice(0, 40);
}

/** 치수 칸 글자에서 그 종류의 칸만 남기고, 0 보다 큰 숫자만 받는다. */
export function parseMeasurements(
  texts: Readonly<Record<string, string>>,
  category: GarmentCategory,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of MEASUREMENT_FIELDS[category]) {
    const value = Number((texts[field.key] ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(value) && value > 0) result[field.key] = value;
  }
  return result;
}

/** 치수 칸에 적을 수 있는 글자: 숫자와 점만, 다섯 글자까지 */
export function cleanMeasurementText(text: string): string {
  return text.replace(/[^0-9.]/g, "").slice(0, 5);
}

/**
 * 상품 링크 칸 값을 열 수 있는 주소로 바꾼다. 쇼핑앱 공유 문구처럼 앞뒤에 글이 붙어 있으면 그 안의 첫 주소를 쓴다.
 * 스킴이 없으면 https 를 붙이고, http 와 https 가 아니면 받지 않는다. 비었거나 받을 수 없으면 null.
 */
export function normalizeLinkUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const found = /https?:\/\/\S+/i.exec(trimmed)?.[0];
  if (found) return found;
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    /^(javascript|data|mailto|tel|file):/i.test(trimmed)
  )
    return null;
  const candidate = trimmed.split(/\s+/)[0] ?? "";
  return /^[^\s/:]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(candidate) ? `https://${candidate}` : null;
}

/** 「상품 보기」 옆에 붙이는 판매처 주소(예: monowhale.kr) */
export function linkHost(url: string): string {
  return url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? url;
}

/** 이름 칸: 사용자가 고치기 전이면 색과 종류에 따라 다시 짓는다. */
export function followGarmentName(form: {
  name: string;
  nameEdited: boolean;
  color: GarmentColor;
  category: GarmentCategory;
}): string {
  return form.nameEdited ? form.name : defaultGarmentName(form.color, form.category);
}

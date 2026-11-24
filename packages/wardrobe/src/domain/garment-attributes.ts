/** 옷 종류. 순서는 「어떤 옷인가요?」 칩과 옷장 칩 순서다. 모자는 액세서리에 든다. */
export const GARMENT_CATEGORIES = [
  { key: "outer", label: "아우터" },
  { key: "top", label: "상의" },
  { key: "bottom", label: "하의" },
  { key: "shoes", label: "신발" },
  { key: "bag", label: "가방" },
  { key: "acc", label: "액세서리" },
] as const;

export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number]["key"];

export function isGarmentCategory(value: unknown): value is GarmentCategory {
  return GARMENT_CATEGORIES.some((category) => category.key === value);
}

export function categoryLabel(category: GarmentCategory): string {
  return GARMENT_CATEGORIES.find((item) => item.key === category)?.label ?? category;
}

/** 색 칩. rgb 는 사진에서 가장 넓은 색을 고를 때 견주는 기준 색이다. */
export const GARMENT_COLORS = [
  { key: "black", label: "블랙", hex: "#151314", rgb: [21, 19, 20] },
  { key: "white", label: "화이트", hex: "#FFFFFF", rgb: [245, 245, 242] },
  { key: "gray", label: "그레이", hex: "#9A9A9A", rgb: [154, 154, 154] },
  { key: "beige", label: "베이지", hex: "#D8C7AE", rgb: [216, 199, 174] },
  { key: "brown", label: "브라운", hex: "#7A5236", rgb: [122, 82, 54] },
  { key: "navy", label: "네이비", hex: "#26324F", rgb: [38, 50, 79] },
  { key: "red", label: "레드", hex: "#B5303B", rgb: [181, 48, 59] },
  { key: "green", label: "그린", hex: "#4F6B4A", rgb: [79, 107, 74] },
] as const;

export type GarmentColor = (typeof GARMENT_COLORS)[number]["key"];

export function isGarmentColor(value: unknown): value is GarmentColor {
  return GARMENT_COLORS.some((color) => color.key === value);
}

export function colorLabel(color: GarmentColor): string {
  return GARMENT_COLORS.find((item) => item.key === color)?.label ?? color;
}

export const SEASONS = [
  { key: "spring", label: "봄" },
  { key: "summer", label: "여름" },
  { key: "fall", label: "가을" },
  { key: "winter", label: "겨울" },
] as const;

export type Season = (typeof SEASONS)[number]["key"];

export function isSeason(value: unknown): value is Season {
  return SEASONS.some((season) => season.key === value);
}

/** 사이즈 표기 칩. 고르지 않아도 된다. */
export const SIZE_LABELS = ["XS", "S", "M", "L", "XL", "FREE"] as const;

export type SizeLabel = (typeof SIZE_LABELS)[number];

export function isSizeLabel(value: unknown): value is SizeLabel {
  return SIZE_LABELS.some((size) => size === value);
}

/** 이름 칸의 처음 값. 사용자가 이름을 고치기 전까지 색과 종류를 바꾸면 따라 바뀐다. */
export function defaultGarmentName(color: GarmentColor, category: GarmentCategory): string {
  return `${colorLabel(color)} ${categoryLabel(category)}`;
}

/** 「옷 치수(선택)」 칸. 종류마다 재는 곳이 다르다. 단위는 unit 이다. */
export interface MeasurementField {
  key: string;
  label: string;
  unit: "cm" | "mm";
}

const cm = (key: string, label: string): MeasurementField => ({ key, label, unit: "cm" });

const TOP_FIELDS = [
  cm("len", "총장"),
  cm("sh", "어깨너비"),
  cm("ch", "가슴단면"),
  cm("sl", "소매길이"),
];
const BAG_FIELDS = [cm("bw", "가로"), cm("bh", "세로"), cm("strap", "끈 길이")];

export const MEASUREMENT_FIELDS: Record<GarmentCategory, readonly MeasurementField[]> = {
  outer: TOP_FIELDS,
  top: TOP_FIELDS,
  bottom: [cm("len", "총장"), cm("wa", "허리단면"), cm("hip", "엉덩이단면"), cm("hem", "밑단단면")],
  shoes: [{ key: "ft", label: "발길이", unit: "mm" }, cm("heel", "굽 높이")],
  bag: BAG_FIELDS,
  acc: BAG_FIELDS,
};

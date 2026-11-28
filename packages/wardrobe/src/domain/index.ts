// wardrobe 도메인: 순수 타입과 함수만 둔다. 시각과 ID 는 인자로 받는다.
export {
  CLOSET_LABELS,
  CLOSET_SLOT_LIMIT,
  closetSlotsLabel,
  isClosetKey,
  saveButtonLabel,
  type ClosetKey,
} from "./closet";
export {
  closetFilter,
  closetFilterCount,
  countLooksByGarment,
  lookUseLabel,
  NO_CLOSET_FILTER,
  type ClosetFilter,
} from "./closet-filter";
export { pickGarmentColor } from "./dominant-color";
export {
  cleanMeasurementText,
  filterGarments,
  followGarmentName,
  linkHost,
  normalizeGarmentName,
  normalizeLinkUrl,
  parseMeasurements,
  parsePriceKrw,
  type CutoutSource,
  type Garment,
  type GarmentFilter,
  type GarmentMethod,
} from "./garment";
export {
  categoryLabel,
  colorLabel,
  defaultGarmentName,
  GARMENT_CATEGORIES,
  GARMENT_COLORS,
  isGarmentCategory,
  isGarmentColor,
  isSeason,
  isSizeLabel,
  MEASUREMENT_FIELDS,
  type MeasurementField,
  SEASONS,
  SIZE_LABELS,
  type GarmentCategory,
  type GarmentColor,
  type Season,
  type SizeLabel,
} from "./garment-attributes";
export { placeOnBody, type BodySpot } from "./body-spot";
export { faceStillVisible, type BrushStroke, type Rect } from "./geometry";
export {
  anchorOf,
  DEFAULT_PLACEMENT,
  nudgeScale,
  nudgeY,
  placeGarment,
  referenceBox,
  scalePercent,
  type GarmentAnchor,
  type Placement,
  type PosePoints,
} from "./placement";

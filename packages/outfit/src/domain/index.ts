// outfit 도메인: 순수 타입과 함수만 둔다. 시각과 ID 는 인자로 받는다.
export { EMPTY_HISTORY, MAX_HISTORY, redo, remember, undo, type OutfitHistory } from "./history";
export { outfitTitle } from "./naming";
export {
  isWorn,
  layered,
  MAX_ACCESSORIES,
  outfitDiff,
  refKey,
  sameOutfit,
  sameRef,
  slotOf,
  toggleGarment,
  type GarmentRef,
  type Outfit,
  type OutfitCategory,
  type OutfitPiece,
  type OutfitSlot,
} from "./outfit";
export { MAX_RECENT, recordRecent, type RecentOutfit } from "./recent";
export { firstFreeSlot, SAVED_SLOTS, savedOutfitTitle } from "./saved";
export { MAX_SUGGESTIONS, suggestGarments, type SuggestCandidate } from "./suggest";
export {
  defaultOutfit,
  isSampleGarmentKey,
  ONBOARDING_SAMPLES,
  RECOMMENDED_LOOKS,
  SAMPLE_GARMENTS,
  samplePiece,
  todayLook,
  type SampleGarment,
  type SampleGarmentKey,
} from "./samples";

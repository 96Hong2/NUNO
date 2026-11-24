import type { OutfitCategory, OutfitPiece } from "@nuno/outfit";

// 코디 무대 설정. 겹쳐 보기 20장 시험(관문 기록표)에서 14장에 못 미친 옷 분류를 여기에 넣는다.
// 넣은 분류의 옷은 입어도 무대에 그리지 않고 옷 카드로만 보인다. 시험 전이라 비어 있다.
export const STAGE_HIDDEN_CATEGORIES: readonly OutfitCategory[] = [];

// 개발 빌드 「저장소 보기」 의 무대 시험 스위치. 앱을 켠 동안만 기억한다.
let devHidden: ReadonlySet<OutfitCategory> | null = null;
let devLandmarks = false;
const listeners = new Set<() => void>();

export function stageHidden(category: OutfitCategory): boolean {
  return (devHidden ?? new Set(STAGE_HIDDEN_CATEGORIES)).has(category);
}

/**
 * 무대에 그리는 옷인지. 겹치지 않는 분류와, 두르는 자리 값이 아직 없는 옷장 액세서리는 그리지 않는다.
 * 그리지 않는 옷은 카드 테두리만 붙고 무대 아래 안내 줄에 이름이 뜬다.
 */
export function drawnOnStage(piece: OutfitPiece): boolean {
  if (stageHidden(piece.category)) return false;
  return !(piece.category === "acc" && piece.ref.kind === "garment");
}

export function showLandmarks(): boolean {
  return devLandmarks;
}

export function setDevStage(patch: {
  hidden?: ReadonlySet<OutfitCategory>;
  landmarks?: boolean;
}): void {
  if (patch.hidden) devHidden = patch.hidden;
  if (patch.landmarks !== undefined) devLandmarks = patch.landmarks;
  for (const listener of listeners) listener();
}

export function onStageConfigChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

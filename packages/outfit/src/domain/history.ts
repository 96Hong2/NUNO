import type { Outfit } from "./outfit";

/** 되돌리기 기록. past 는 오래된 것부터, future 는 앞으로 돌릴 것(가까운 것이 끝)이다. */
export interface OutfitHistory {
  past: readonly Outfit[];
  future: readonly Outfit[];
}

export const EMPTY_HISTORY: OutfitHistory = { past: [], future: [] };

/** 되돌리기 기록에 남기는 앞 코디 수 */
export const MAX_HISTORY = 20;

/** 옷을 바꾸기 전 코디를 남긴다. 앞으로 돌릴 기록은 지운다. */
export function remember(history: OutfitHistory, before: Outfit): OutfitHistory {
  return { past: [...history.past, before].slice(-MAX_HISTORY), future: [] };
}

/** 「이전 코디」. 기록이 없으면 null. */
export function undo(
  history: OutfitHistory,
  current: Outfit,
): { outfit: Outfit; history: OutfitHistory } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    outfit: previous,
    history: { past: history.past.slice(0, -1), future: [...history.future, current] },
  };
}

/** 「다음 코디」. 기록이 없으면 null. */
export function redo(
  history: OutfitHistory,
  current: Outfit,
): { outfit: Outfit; history: OutfitHistory } | null {
  const next = history.future[history.future.length - 1];
  if (!next) return null;
  return {
    outfit: next,
    history: {
      past: [...history.past, current].slice(-MAX_HISTORY),
      future: history.future.slice(0, -1),
    },
  };
}

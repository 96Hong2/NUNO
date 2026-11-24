import { toKstDateString } from "@nuno/clock";
import {
  defaultOutfit,
  deleteSavedOutfit,
  EMPTY_HISTORY,
  firstFreeSlot,
  isSampleGarmentKey,
  isWorn,
  listRecentOutfits,
  listSavedOutfits,
  readCurrentOutfit,
  recordRecent,
  redo,
  remember,
  renameSavedOutfit,
  replaceRecentOutfits,
  sameOutfit,
  samplePiece,
  saveOutfitToSlot,
  savedOutfitTitle,
  slotOf,
  todayLook,
  toggleGarment,
  undo,
  writeCurrentOutfit,
  type Outfit,
  type OutfitHistory,
  type OutfitPiece,
  type RecentOutfit,
  type SampleGarmentKey,
  type SavedOutfit,
} from "@nuno/outfit";
import { insertLook, type Look } from "@nuno/lookbook";
import { finishOnboarding } from "@nuno/profile";
import type { SqlExecutor } from "@nuno/device-db";
import { listCloset, readGarment } from "@nuno/wardrobe";
import { systemClock } from "../adapters/system-clock";
import { uuidGenerator } from "../adapters/uuid";
import { getDeviceDb } from "./device-db";
import { loadCurrentTwin } from "./twin";
import { onClosetChange } from "./wardrobe";

// 피팅룸 「코디」 무대의 상태. 지금 코디와 최근 코디 줄, 내 코디는 기기 판 4 에 쓰고,
// 되돌리기 기록은 앱을 켠 동안만 트윈마다 기억한다. 탭을 옮겨 와도 남는다.

export interface CoordiState {
  twinKey: string;
  outfit: Outfit;
  canUndo: boolean;
  canRedo: boolean;
  /** 지금 트윈의 최근 코디(맨 앞이 가장 최근) */
  recents: RecentOutfit[];
  /** 내 코디 칸(1~5). 모든 트윈의 것이다. */
  saved: SavedOutfit[];
}

const now = () => systemClock.now().toISOString();
const today = () => toKstDateString(systemClock.now());

const histories = new Map<string, OutfitHistory>();
const listeners = new Set<() => void>();

export function onCoordiChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed(): void {
  for (const listener of listeners) listener();
}

// 옷장이 바뀌면(옷을 지우면 코디에서도 빠진다) 무대도 다시 읽는다.
onClosetChange(changed);

export async function loadCoordi(): Promise<CoordiState> {
  const twinKey = await loadCurrentTwin();
  const { db } = await getDeviceDb();
  const [stored, recents, saved] = await Promise.all([
    readCurrentOutfit(db, twinKey),
    listRecentOutfits(db),
    listSavedOutfits(db),
  ]);
  const history = histories.get(twinKey) ?? EMPTY_HISTORY;
  return {
    twinKey,
    outfit: stored ?? defaultOutfit(twinKey),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    recents: recents.filter((item) => item.twinKey === twinKey),
    saved,
  };
}

// 바꾸기는 한 줄로 세운다. 카드를 빠르게 이어 누르거나 트윈을 바꾸는 중에 눌러도
// 앞 바꾸기가 끝난 기기의 지금 코디로 다음 코디를 계산한다.
let queue: Promise<unknown> = Promise.resolve();
function inLine<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * 지금 코디와 최근 줄을 트랜잭션 안에서 쓴다. 피팅룸 바꾸기와 온보딩 3단계가 함께 쓴다.
 * 되돌리기 기록이나 알림의 앞 코디에 그 사이 지운 옷장 옷이 있으면 빼고 쓴다. 쓴 코디를 돌려준다.
 */
async function writeOutfitTx(tx: SqlExecutor, twinKey: string, wanted: Outfit): Promise<Outfit> {
  const ids = new Set((await listCloset(tx, "mine")).map((garment) => garment.id));
  const outfit = wanted.filter((piece) => piece.ref.kind === "sample" || ids.has(piece.ref.id));
  const recents = await listRecentOutfits(tx);
  await writeCurrentOutfit(tx, twinKey, outfit, uuidGenerator.next(), now());
  await replaceRecentOutfits(
    tx,
    recordRecent(recents, twinKey, outfit, uuidGenerator.next()),
    now(),
  );
  return outfit;
}

async function writeOutfit(twinKey: string, wanted: Outfit): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction((tx) => writeOutfitTx(tx, twinKey, wanted));
}

export type OutfitUpdate = Outfit | ((current: Outfit) => Outfit);

/**
 * 옷을 바꿔 입는다. 앞 코디를 되돌리기 기록에 남기고, 바꾸기 전 코디를 돌려준다(바뀐 것이 없으면 null).
 * update 가 함수면 줄 차례가 왔을 때의 지금 코디로 계산한다.
 * twinKey 를 주면 그 트윈이 지금 트윈일 때만 바꾼다(알림 「되돌리기」 가 다른 트윈에 입히지 않게).
 * 「내 코디」 불러오기와 「오늘 코디」 는 remember: false 로 기록에 쌓지 않는다(와이어프레임과 같다).
 */
export function changeOutfit(
  update: OutfitUpdate,
  options: { remember?: boolean; twinKey?: string } = {},
): Promise<Outfit | null> {
  return inLine(async () => {
    const state = await loadCoordi();
    if (options.twinKey && options.twinKey !== state.twinKey) return null;
    const next = typeof update === "function" ? update(state.outfit) : update;
    if (sameOutfit(state.outfit, next)) return null;
    if (options.remember !== false) {
      histories.set(
        state.twinKey,
        remember(histories.get(state.twinKey) ?? EMPTY_HISTORY, state.outfit),
      );
    }
    await writeOutfit(state.twinKey, next);
    changed();
    return state.outfit;
  });
}

/** 「이전 코디」, 「다음 코디」. 기록이 없으면 false. */
export function stepOutfit(direction: "undo" | "redo"): Promise<boolean> {
  return inLine(async () => {
    const state = await loadCoordi();
    const history = histories.get(state.twinKey) ?? EMPTY_HISTORY;
    const result = direction === "undo" ? undo(history, state.outfit) : redo(history, state.outfit);
    if (!result) return false;
    histories.set(state.twinKey, result.history);
    await writeOutfit(state.twinKey, result.outfit);
    changed();
    return true;
  });
}

/** 홈 「오늘 코디」 와 내 코디 「오늘 뭐 입지」: 오늘 추천 코디를 입힌다. */
export async function wearTodayLook(): Promise<void> {
  const twinKey = await loadCurrentTwin();
  const look = todayLook(twinKey, today());
  if (look) await changeOutfit(look.items.map(samplePiece), { remember: false });
}

export function todayLookOf(twinKey: string) {
  return todayLook(twinKey, today());
}

export type SaveResult = { kind: "saved"; count: number } | { kind: "full" } | { kind: "empty" };

/** 「지금 코디 담기」: 첫 빈 칸에 담는다. 다 찼으면 full, 옷이 없으면 empty. */
export function saveCurrentOutfit(): Promise<SaveResult> {
  return inLine(async () => {
    const state = await loadCoordi();
    if (state.outfit.length === 0) return { kind: "empty" };
    const slot = firstFreeSlot(state.saved.map((item) => item.slot));
    if (slot === null) return { kind: "full" };
    await putSaved(state.twinKey, state.outfit, slot, savedOutfitTitle(today()));
    return { kind: "saved", count: state.saved.length + 1 };
  });
}

/** 「이 칸에 덮어쓰기」 */
export function overwriteSavedSlot(slot: number): Promise<void> {
  return inLine(async () => {
    const state = await loadCoordi();
    await putSaved(state.twinKey, state.outfit, slot, savedOutfitTitle(today()));
  });
}

function putSavedTx(tx: SqlExecutor, twinKey: string, outfit: Outfit, slot: number, title: string) {
  return saveOutfitToSlot(tx, { id: uuidGenerator.next(), slot, title, twinKey, outfit }, now());
}

async function putSaved(twinKey: string, outfit: Outfit, slot: number, title: string) {
  const { db } = await getDeviceDb();
  await db.transaction((tx) => putSavedTx(tx, twinKey, outfit, slot, title));
  changed();
}

export async function renameSaved(id: string, title: string): Promise<void> {
  const { db } = await getDeviceDb();
  await renameSavedOutfit(db, id, title, now());
  changed();
}

export async function deleteSaved(id: string): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction((tx) => deleteSavedOutfit(tx, id));
  changed();
}

/** 옷 상세 「트윈에 입혀 보기」, 담은 뒤 「이 옷으로 코디하기」: 그 옷을 지금 코디에 입힌다(같은 종류는 바뀐다). */
export async function wearGarment(id: string): Promise<void> {
  const { db } = await getDeviceDb();
  const garment = await readGarment(db, id);
  if (!garment || garment.closet !== "mine") return;
  const piece: OutfitPiece = {
    ref: { kind: "garment", id },
    category: garment.category,
    slot: slotOf(garment.category),
  };
  await changeOutfit((current) =>
    isWorn(current, piece.ref) ? current : toggleGarment(current, piece),
  );
}

/**
 * 온보딩을 끝낸다. 4/4 「완성 룩이에요」 의 룩북 저장 시트에서 부르면(look 이 있으면)
 * 룩 한 장, 지금 코디, 최근 줄, 「내 코디」 빈 첫 칸 「첫 코디」 를 한 트랜잭션에 쓰고 온보딩을 끝낸다.
 * 룩 ID 는 시트를 열 때 정한다. 같은 룩이 이미 있으면(저장 단추 연타) 나머지를 모두 건너뛴다.
 * look 이 없으면(「건너뛰기」) 끝만 적는다. 세 컨텍스트의 쓰기를 트랜잭션 하나로 묶는다.
 */
export async function finishOnboardingOutfit(look: Look | null): Promise<void> {
  const { db } = await getDeviceDb();
  await db.transaction(async (tx) => {
    if (look) {
      if (!(await insertLook(tx, look))) return;
      const outfit = look.items.map((item) => samplePiece(item.sampleKey as SampleGarmentKey));
      const written = await writeOutfitTx(tx, look.twinKey, outfit);
      const slot = firstFreeSlot((await listSavedOutfits(tx)).map((item) => item.slot));
      if (slot !== null) await putSavedTx(tx, look.twinKey, written, slot, "첫 코디");
    }
    await finishOnboarding(tx);
  });
  changed();
}

/**
 * 룩의 입은 옷 시트 「트윈에 입혀 보기 N」, 룩 크게 보기 「트윈에 입혀 보기」: 고른 견본 옷만 지금 코디 위에 입힌다.
 * 같은 종류는 바뀌고, 고르지 않은 종류는 입던 옷을 그대로 둔다. 되돌리기 기록에 쌓인다.
 */
export function wearSamples(keys: readonly string[]): Promise<Outfit | null> {
  return changeOutfit((current) =>
    keys.reduce<Outfit>((outfit, key) => {
      const piece = samplePiece(key as SampleGarmentKey);
      return isWorn(outfit, piece.ref) ? outfit : toggleGarment(outfit, piece);
    }, current),
  );
}

/**
 * 룩북 크게 보기 「트윈에 입혀 보기」 와 입은 옷 시트: 룩 옷 키(`s:<견본 키>`, `g:<옷 ID>`)의 옷을 지금 코디 위에 입힌다.
 * 옷장 옷은 「내 옷」 칸에 남아 있을 때만 입힌다. 같은 종류는 바뀌고 되돌리기 기록에 쌓인다. 입힌 벌 수를 돌려준다.
 */
export async function wearLookItems(keys: readonly string[]): Promise<number> {
  const { db } = await getDeviceDb();
  const pieces: OutfitPiece[] = [];
  for (const key of keys) {
    const id = key.slice(2);
    if (key.startsWith("s:") && isSampleGarmentKey(id)) {
      pieces.push(samplePiece(id));
    } else if (key.startsWith("g:")) {
      const garment = await readGarment(db, id);
      if (garment?.closet !== "mine") continue;
      pieces.push({
        ref: { kind: "garment", id },
        category: garment.category,
        slot: slotOf(garment.category),
      });
    }
  }
  if (pieces.length === 0) return 0;
  await changeOutfit((current) =>
    pieces.reduce<Outfit>(
      (outfit, piece) => (isWorn(outfit, piece.ref) ? outfit : toggleGarment(outfit, piece)),
      current,
    ),
  );
  return pieces.length;
}

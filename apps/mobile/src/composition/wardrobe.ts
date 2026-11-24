import {
  countCloset,
  defaultGarmentName,
  deleteGarment,
  insertGarment,
  listCloset,
  listRecentGarments,
  moveGarments,
  NO_EDITS,
  normalizeGarmentName,
  normalizeLinkUrl,
  parseMeasurements,
  parsePriceKrw,
  readGarment,
  setFavorite,
  updateGarmentFit,
  type ClosetCounts,
  type ClosetKey,
  type Garment,
  type GarmentCategory,
  type GarmentColor,
  type GarmentEdits,
  type GarmentFit,
  type GarmentMethod,
  type Placement,
  type PreparedPhoto,
  type RenderedGarment,
  type Season,
  type SizeLabel,
} from "@nuno/wardrobe";
import { removeGarmentFromOutfits } from "@nuno/outfit";
import { garmentMedia } from "../adapters/garment-media";
import { pickPhoto, type PickedPhoto } from "../adapters/photo-picker";
import { systemClock } from "../adapters/system-clock";
import { uuidGenerator } from "../adapters/uuid";
import { getDeviceDb } from "./device-db";

/** 옷 카드가 그릴 그림 주소를 붙인 옷 */
export interface GarmentCard extends Garment {
  thumbUri: string;
}

const now = () => systemClock.now().toISOString();

// 옷장이 바뀌면 지금 보이는 옷장, 홈, 옷 상세가 다시 읽는다. 「되돌리기」 처럼 다른 화면에서 눌린 동작도 반영된다.
const closetListeners = new Set<() => void>();

export function onClosetChange(listener: () => void): () => void {
  closetListeners.add(listener);
  return () => closetListeners.delete(listener);
}

function closetChanged(): void {
  for (const listener of closetListeners) listener();
}

async function withThumb(garment: Garment): Promise<GarmentCard> {
  return { ...garment, thumbUri: await garmentMedia.resolve(garment.thumbPath) };
}

export interface ClosetView {
  counts: ClosetCounts;
  garments: GarmentCard[];
}

export async function loadCloset(closet: ClosetKey): Promise<ClosetView> {
  const { db } = await getDeviceDb();
  const [counts, garments] = await Promise.all([countCloset(db), listCloset(db, closet)]);
  return { counts, garments: await Promise.all(garments.map(withThumb)) };
}

/** 홈 「최근 넣은 옷」 탭: 두 칸을 합쳐 마지막에 넣은 옷부터 12벌 */
export const RECENT_GARMENT_LIMIT = 12;

export async function loadRecentGarments(): Promise<ClosetView> {
  const { db } = await getDeviceDb();
  const [counts, garments] = await Promise.all([
    countCloset(db),
    listRecentGarments(db, RECENT_GARMENT_LIMIT),
  ]);
  return { counts, garments: await Promise.all(garments.map(withThumb)) };
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<void> {
  const { db } = await getDeviceDb();
  await setFavorite(db, id, favorite, now());
  closetChanged();
}

/** 고른 옷을 다른 칸으로 옮긴다. 「되돌리기」 는 같은 함수로 원래 칸에 돌려놓는다. */
export async function moveToCloset(ids: readonly string[], to: ClosetKey): Promise<number> {
  const { db } = await getDeviceDb();
  const moved = await db.transaction((tx) => moveGarments(tx, ids, to, now()));
  closetChanged();
  return moved;
}

export interface GarmentDetail extends GarmentCard {
  cutoutUri: string;
}

export async function loadGarment(id: string): Promise<GarmentDetail | null> {
  const { db } = await getDeviceDb();
  const garment = await readGarment(db, id);
  if (!garment) return null;
  const card = await withThumb(garment);
  return { ...card, cutoutUri: await garmentMedia.resolve(garment.cutoutPath) };
}

/** 「치수 고치기」 의 「저장」 */
export async function saveGarmentFit(id: string, fit: GarmentFit): Promise<void> {
  const { db } = await getDeviceDb();
  await updateGarmentFit(db, id, fit, now());
  closetChanged();
}

/** 화면들이 새 목록을 읽기 전에 낡은 그림 주소를 한 번 더 그릴 수 있어, 그림 파일은 이만큼 뒤에 지운다. */
const FILE_REMOVE_DELAY_MS = 3000;

/** 「옷 지우기」: 기록을 먼저 지우고 그림 파일을 지운다. 파일이 남아도 옷장에는 보이지 않는다. */
export async function removeGarment(id: string): Promise<void> {
  const { db } = await getDeviceDb();
  // 옷장에서 지운 옷은 지금 코디, 내 코디, 최근 코디에서도 뺀다.
  await db.transaction(async (tx) => {
    await deleteGarment(tx, id);
    await removeGarmentFromOutfits(tx, id, now());
  });
  closetChanged();
  setTimeout(() => void garmentMedia.remove(id), FILE_REMOVE_DELAY_MS);
}

// ── 옷 넣기 네 단계 ─────────────────────────────────────────────

/** 손보기 중인 옷. 사진을 고를 때 만들고, 담거나 나가면 비운다. 앱을 다시 열면 남지 않는다. */
export interface GarmentDraft {
  id: string;
  method: GarmentMethod;
  photo: PreparedPhoto;
  edits: GarmentEdits;
  /** 「다음」 으로 넘길 때 구운 누끼 */
  rendered: RenderedGarment | null;
  /** 3 / 4, 4 / 4 에 적은 값. 앞 화면에 갔다 와도 남는다. */
  form: DraftForm | null;
}

/** 「어떤 옷인가요?」 와 「트윈에 맞춰 볼게요」 입력 칸. 글자 칸은 적은 그대로 둔다. */
export interface DraftForm {
  category: GarmentCategory;
  color: GarmentColor;
  seasons: Season[];
  name: string;
  /** 사용자가 이름을 고쳤으면 true. 그 전까지는 색과 종류를 바꾸면 이름이 따라 바뀐다. */
  nameEdited: boolean;
  closet: ClosetKey;
  brand: string;
  price: string;
  link: string;
  sizeLabel: SizeLabel | null;
  measurements: Record<string, string>;
  placement: Placement;
}

let draft: GarmentDraft | null = null;

export function currentDraft(): GarmentDraft | null {
  return draft;
}

export function updateDraft(patch: Partial<Omit<GarmentDraft, "id" | "method" | "photo">>): void {
  if (!draft) return;
  // 구운 그림을 바꾸거나 비우면 앞 그림 주소를 놓는다.
  const old = draft.rendered?.cutoutUri;
  if ("rendered" in patch && old && old !== patch.rendered?.cutoutUri) garmentMedia.release(old);
  draft = { ...draft, ...patch };
}

/** 담거나 나가면 초안과 그 그림 주소를 놓아준다. */
export function clearDraft(): void {
  if (draft) {
    garmentMedia.release(draft.photo.originalUri);
    garmentMedia.release(draft.photo.cutoutUri);
    if (draft.rendered) garmentMedia.release(draft.rendered.cutoutUri);
  }
  draft = null;
}

export const garmentEditable = garmentMedia.editable;

export type StartResult =
  { kind: "ready"; draft: GarmentDraft } | Exclude<PickedPhoto, { kind: "picked" }>;

/** 「사진 찍기」, 「앨범에서 고르기」: 사진을 고르고 누끼를 만들어 손보기 초안을 연다. */
export async function startGarmentDraft(method: GarmentMethod): Promise<StartResult> {
  const picked = await pickPhoto(method);
  if (picked.kind !== "picked") return picked;
  clearDraft();
  const photo = await garmentMedia.prepare(picked.uri);
  draft = { id: uuidGenerator.next(), method, photo, edits: NO_EDITS, rendered: null, form: null };
  return { kind: "ready", draft };
}

/** 「배경을 지우지 못했어요」 의 「다시 시도」: 같은 사진으로 누끼를 다시 만든다. 지웠으면 true. */
export async function retryDraftCutout(): Promise<boolean> {
  const current = draft;
  if (!current) return false;
  const photo = await garmentMedia.prepare(current.photo.originalUri);
  draft = { ...current, photo, edits: NO_EDITS, rendered: null };
  return photo.cutoutSource !== "none";
}

/** 화면이 다 쓴 미리보기 주소를 놓아준다. */
export function releaseDraftImage(uri: string): void {
  garmentMedia.release(uri);
}

export function renderDraftPreview(photo: PreparedPhoto, edits: GarmentEdits) {
  return garmentMedia.renderPreview(photo, edits);
}

export function renderDraft(photo: PreparedPhoto, edits: GarmentEdits) {
  return garmentMedia.render(photo, edits);
}

/**
 * 마지막 담기 단추. 그림을 옷 폴더에 쓰고 옷 행과 넣은 길 행을 한 트랜잭션에 넣는다.
 * 옷 ID 는 사진을 고를 때 정해져 있어 연타해도 옷은 한 벌이다.
 */
export async function saveDraft(): Promise<{ id: string; closet: ClosetKey; name: string }> {
  const current = draft;
  if (!current?.rendered || !current.form)
    throw new Error("담을 옷이 없다. 사진 고르기부터 다시 한다");
  const { form, rendered } = current;
  const name = normalizeGarmentName(form.name, defaultGarmentName(form.color, form.category));
  const files = await garmentMedia.store(current.id, current.photo, rendered);
  const { db } = await getDeviceDb();
  const maskEdited = current.edits.strokes.some((stroke) => stroke.mode !== "cover");
  // 기록을 넣지 못하면 먼저 쓴 그림 파일을 지운다. 같은 ID 로 이미 들어간 옷이면 넣지 않을 뿐 실패가 아니다.
  await db
    .transaction((tx) =>
      insertGarment(
        tx,
        {
          ...files,
          id: current.id,
          closet: form.closet,
          category: form.category,
          color: form.color,
          name,
          brand: form.brand.trim() || null,
          seasons: form.seasons,
          priceKrw: parsePriceKrw(form.price),
          linkUrl: normalizeLinkUrl(form.link),
          sizeLabel: form.sizeLabel,
          measurements: parseMeasurements(form.measurements, form.category),
          placement: form.placement,
          method: current.method,
          hadPerson: current.photo.hadPerson,
          cutoutSource: current.photo.cutoutSource,
          maskEdited,
        },
        now(),
      ),
    )
    .catch(async (error: unknown) => {
      await garmentMedia.remove(current.id);
      throw error;
    });
  closetChanged();
  return { id: current.id, closet: form.closet, name };
}

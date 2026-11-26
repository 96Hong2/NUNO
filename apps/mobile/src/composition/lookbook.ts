import { toKstDateString } from "@nuno/clock";
import { listLooks, lookTitleFromNames, type Look, type LookbookSummary } from "@nuno/lookbook";
import { isSampleGarmentKey, SAMPLE_GARMENTS } from "@nuno/outfit";
import {
  countLooksByGarment,
  insertGarment,
  listClosetSampleKeys,
  readGarment,
  type GarmentCategory,
  type GarmentColor,
} from "@nuno/wardrobe";
import { apiRequest, hasApiServer } from "../adapters/api-client";
import { assetFileUri } from "../adapters/asset-file";
import { garmentMedia } from "../adapters/garment-media";
import { systemClock } from "../adapters/system-clock";
import { uuidGenerator } from "../adapters/uuid";
import { sessionToken } from "./account";
import { getDeviceDb } from "./device-db";
import { loadCurrentTwin } from "./twin";
import { notifyClosetChanged } from "./wardrobe";

// 룩북: 저장한 룩을 읽고, 룩의 입은 옷(견본 옷)을 「담은 옷」 칸에 담는다.
// 서버 주소가 있고 가입했으면 서버 완성 룩과 룩북 여러 권을 함께 읽는다. 아니면 기기 견본 룩만이다.

export interface LookbookView {
  looks: Look[];
  /** 지금 트윈. 「트윈에 입혀 보기」 는 룩을 저장한 트윈이 아니라 지금 트윈에 입힌다 */
  twinKey: string;
  /** 두 칸 어디든 남아 있는 견본 옷 키(입은 옷 시트 「옷장에 있음」) */
  inCloset: string[];
}

export async function loadLookbook(): Promise<LookbookView> {
  const { db } = await getDeviceDb();
  const [looks, inCloset, twinKey] = await Promise.all([
    listLooks(db),
    listClosetSampleKeys(db),
    loadCurrentTwin(),
  ]);
  return { looks, inCloset, twinKey };
}

export function newLookId(): string {
  return uuidGenerator.next();
}

export function nowIso(): string {
  return systemClock.now().toISOString();
}

/** 견본 옷 이름 앞말로 고르는 색. 모르면 베이지다 */
const COLOR_WORDS: [string, GarmentColor][] = [
  ["블랙", "black"],
  ["화이트", "white"],
  ["아이보리", "white"],
  ["크림", "white"],
  ["그레이", "gray"],
  ["차콜", "gray"],
  ["베이지", "beige"],
  ["브라운", "brown"],
  ["네이비", "navy"],
  ["레드", "red"],
];

function colorOf(name: string): GarmentColor {
  return COLOR_WORDS.find(([word]) => name.startsWith(word))?.[1] ?? "beige";
}

/** 입은 옷 시트에서 고른 견본 옷. image 는 설치 파일 그림 모듈이다 */
export interface SampleToKeep {
  sampleKey: string;
  name: string;
  category: GarmentCategory;
  image: unknown;
}

/**
 * 「옷장에 담기」: 옷장에 없는 견본 옷을 「담은 옷」 칸에 담는다. 담은 수와 이미 있던 수를 돌려준다.
 * 그림은 설치 파일 견본 그림을 옷 폴더에 쓴다. 넣은 길은 sample, 견본 키를 함께 남긴다.
 */
export async function keepSamplesInCloset(
  picked: readonly SampleToKeep[],
): Promise<{ added: number; already: number }> {
  const { db } = await getDeviceDb();
  const inCloset = new Set(await listClosetSampleKeys(db));
  const missing = picked.filter((item) => !inCloset.has(item.sampleKey));
  for (const item of missing) {
    const id = uuidGenerator.next();
    const files = await garmentMedia.storeImage(id, await assetFileUri(item.image));
    await db
      .transaction((tx) =>
        insertGarment(
          tx,
          {
            ...files,
            id,
            closet: "wanted",
            category: item.category,
            color: colorOf(item.name),
            name: item.name,
            brand: null,
            seasons: [],
            priceKrw: null,
            linkUrl: null,
            sizeLabel: null,
            measurements: {},
            placement: null,
            cutoutSource: "fixture",
            maskEdited: false,
            method: "sample",
            hadPerson: false,
            sampleKey: item.sampleKey,
          },
          nowIso(),
        ),
      )
      .catch(async (error: unknown) => {
        await garmentMedia.remove(id);
        throw error;
      });
  }
  if (missing.length > 0) notifyClosetChanged();
  return { added: missing.length, already: picked.length - missing.length };
}

/** 영수증 카드의 오늘 날짜: 짧게 「11.25」, 길게 「11월 25일」(한국 날짜) */
export function todayLabels(): { short: string; long: string } {
  const [, month = "1", day = "1"] = toKstDateString(systemClock.now()).split("-");
  return { short: `${month}.${day}`, long: `${Number(month)}월 ${Number(day)}일` };
}

/** 서버에 저장한 완성 룩 줄 하나(`GET /v1/looks`) */
export interface ServerLook {
  lookId: string;
  resultId: string;
  /** 서명 주소. 기한이 지나면 다시 읽는다 */
  imageUrl: string;
  /** 만들 때 보낸 입은 옷: id 는 견본 옷 `s:<키>`, 옷장 옷 `g:<옷 ID>` 다 */
  wornItems: { id?: unknown; name?: unknown }[];
  isFavorite: boolean;
  savedAt: string;
  /** null 이면 「모든 룩」 줄이다 */
  lookbookId: string | null;
  /** 그 결과가 든 룩북 ID 들 */
  inLookbooks: string[];
}

/** 룩북 크게 보기와 홈 카드가 보이는 룩. 기기 견본 룩(온보딩 「첫 코디」)과 서버 완성 룩 둘이다 */
export type BookLook =
  | { kind: "device"; key: string; title: string; savedAt: string; isFavorite: false; look: Look }
  | {
      kind: "server";
      key: string;
      title: string;
      savedAt: string;
      isFavorite: boolean;
      look: ServerLook;
    };

/** 책장의 서버 룩북 한 권. covers 는 앞 룩 1~4장의 서명 주소다 */
export interface ShelfBook extends LookbookSummary {
  covers: string[];
}

export interface ShelfView {
  /** 가입해서 서버 룩북을 쓸 수 있다(「새 룩북」 카드) */
  signedIn: boolean;
  /** 「모든 룩」: 기기 견본 룩과 서버 완성 룩, 최근 저장 순 */
  allLooks: BookLook[];
  books: ShelfBook[];
}

export interface BookView {
  /** null 이면 「모든 룩」 */
  id: string | null;
  title: string;
  looks: BookLook[];
  /** 「다른 룩북에 넣기」 줄로 쓸 서버 룩북 */
  books: LookbookSummary[];
}

const deviceLook = (look: Look): BookLook => ({
  kind: "device",
  key: `device:${look.id}`,
  title: look.title,
  savedAt: look.createdAt,
  isFavorite: false,
  look,
});

const serverLook = (look: ServerLook): BookLook => ({
  kind: "server",
  key: look.lookId,
  title: lookTitleFromNames(
    look.wornItems
      .map((item) => item.name)
      .filter((name): name is string => typeof name === "string"),
  ),
  savedAt: look.savedAt,
  isFavorite: look.isFavorite,
  look,
});

const newestFirst = (a: BookLook, b: BookLook) => b.savedAt.localeCompare(a.savedAt);

/** 서버 룩북을 쓸 수 있으면 세션 토큰, 아니면 null(서버 없는 빌드, 가입 전) */
async function lookbookToken(): Promise<string | null> {
  return hasApiServer() ? sessionToken() : null;
}

async function serverShelf(
  token: string,
): Promise<{ looks: ServerLook[]; books: ShelfBook[] } | null> {
  const [looks, shelf] = await Promise.all([
    apiRequest<{ looks: ServerLook[] }>("/v1/looks?lookbook=all", { token }),
    apiRequest<{ allCount: number; books: ShelfBook[] }>("/v1/lookbooks", { token }),
  ]);
  if (!looks.ok || !shelf.ok) return null;
  return { looks: looks.data.looks, books: shelf.data.books };
}

/** 피팅룸 「룩북」 책장 */
export async function loadShelf(): Promise<ShelfView> {
  const { db } = await getDeviceDb();
  const [device, token] = await Promise.all([listLooks(db), lookbookToken()]);
  const server = token ? await serverShelf(token) : null;
  return {
    signedIn: token !== null,
    allLooks: [...device.map(deviceLook), ...(server?.looks ?? []).map(serverLook)].sort(
      newestFirst,
    ),
    books: server?.books ?? [],
  };
}

/** 홈 「최근 저장한 룩」: 기기 견본 룩과 서버 완성 룩을 최근 저장 순으로 */
export async function loadRecentLooks(): Promise<BookLook[]> {
  return (await loadShelf()).allLooks;
}

/**
 * 「내 옷」 카드의 「룩 N개에 썼어요」: 옷장 옷 ID 별 룩 수. 기기 견본 룩과 서버 「모든 룩」 의 입은 옷 키 `g:<옷 ID>` 로 센다.
 * 서버가 없거나 가입 전이면 기기 룩만 센다.
 */
export async function loadGarmentLookCounts(): Promise<Record<string, number>> {
  const { allLooks } = await loadShelf();
  return countLooksByGarment(
    allLooks.map((book) =>
      (book.kind === "device"
        ? book.look.items.map((item) => `s:${item.sampleKey}`)
        : book.look.wornItems.map((item) => textOf(item.id))
      )
        .filter((key) => key.startsWith("g:"))
        .map((key) => key.slice(2)),
    ),
  );
}

/** 룩북 크게 보기. id 는 `all` 이나 서버 룩북 ID 다. 없거나 남의 룩북이면 null */
export async function loadBook(id: string): Promise<BookView | null> {
  const shelf = await loadShelf();
  const books = shelf.books.map(({ id: bookId, title, lookCount }) => ({
    id: bookId,
    title,
    lookCount,
  }));
  if (id === "all") return { id: null, title: "모든 룩", looks: shelf.allLooks, books };
  const book = books.find((item) => item.id === id);
  const token = await lookbookToken();
  if (!book || !token) return null;
  const result = await apiRequest<{ looks: ServerLook[] }>(
    `/v1/looks?lookbook=${encodeURIComponent(id)}`,
    { token },
  );
  if (!result.ok) return null;
  return { id, title: book.title, looks: result.data.looks.map(serverLook), books };
}

/** 룩 사진 오른쪽 위 별. 같은 결과가 든 다른 룩북 줄도 함께 바뀐다 */
export async function setLookFavorite(lookId: string, on: boolean): Promise<boolean> {
  const token = await lookbookToken();
  if (!token) return false;
  const result = await apiRequest(`/v1/looks/${encodeURIComponent(lookId)}/favorite`, {
    method: "POST",
    token,
    body: { on },
  });
  return result.ok;
}

/** 「복사해서 넣기」. 이미 그 룩북에 있으면 already 다 */
export async function copyLook(
  lookId: string,
  lookbookId: string,
): Promise<{ ok: boolean; already: boolean }> {
  const token = await lookbookToken();
  if (!token) return { ok: false, already: false };
  const result = await apiRequest<{ already?: boolean }>(
    `/v1/looks/${encodeURIComponent(lookId)}/copy`,
    { method: "POST", token, body: { lookbookId } },
  );
  return { ok: result.ok, already: result.ok && result.data.already === true };
}

/** 「옮기기」 와 「되돌리기」. 되돌리기는 받은 fromLookbookId 로 다시 옮긴다 */
export async function moveLook(
  lookId: string,
  lookbookId: string,
): Promise<{ ok: true; fromLookbookId: string } | { ok: false; error: string }> {
  const token = await lookbookToken();
  if (!token) return { ok: false, error: "unauthorized" };
  const result = await apiRequest<{ fromLookbookId: string }>(
    `/v1/looks/${encodeURIComponent(lookId)}/move`,
    { method: "POST", token, body: { lookbookId } },
  );
  return result.ok
    ? { ok: true, fromLookbookId: result.data.fromLookbookId }
    : { ok: false, error: result.error };
}

/** 「새 룩북 만들기」 의 「만들기」. 이름은 서버가 앞뒤 공백을 빼고 12자까지 받는다 */
export async function createLookbook(title: string): Promise<{ id: string; title: string } | null> {
  const token = await lookbookToken();
  if (!token) return null;
  const result = await apiRequest<{ id: string; title: string }>("/v1/lookbooks", {
    method: "POST",
    token,
    body: { title },
  });
  return result.ok ? result.data : null;
}

/** 입은 옷 시트의 한 줄. 룩북 크게 보기의 기기 견본 룩과 서버 완성 룩이 함께 쓴다 */
export interface WornRow {
  /** 룩 옷 키: 견본 옷 `s:<키>`, 옷장 옷 `g:<옷 ID>`. 「트윈에 입혀 보기」 에 그대로 넘긴다 */
  key: string;
  name: string;
  category: GarmentCategory;
  /** 견본 옷 키. 옷장 옷이면 null */
  sampleKey: string | null;
  /** 옷장 옷 카드 그림 주소. 견본 옷이면 null 이고 설치 파일 그림을 쓴다 */
  thumbUri: string | null;
  /** 옷장에 있다. 견본 옷은 두 칸 어디든, 옷장 옷은 「내 옷」 칸이다 */
  inCloset: boolean;
  /** 이 휴대폰에 없어 고를 수 없다(지운 옷장 옷, 다른 휴대폰에서 넣은 옷) */
  gone: boolean;
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * 룩의 입은 옷을 시트 줄로 읽는다. 서버 완성 룩은 만들 때 보낸 옷 키로 견본 옷과 이 휴대폰 옷장 옷을 찾는다.
 * 키를 알아볼 수 없는 줄은 뺀다.
 */
export async function loadWornRows(look: BookLook): Promise<WornRow[]> {
  const { db } = await getDeviceDb();
  const inCloset = new Set(await listClosetSampleKeys(db));
  const items =
    look.kind === "device"
      ? look.look.items.map((item) => ({ id: `s:${item.sampleKey}`, name: item.name }))
      : look.look.wornItems.map((item) => ({ id: textOf(item.id), name: textOf(item.name) }));
  const rows: WornRow[] = [];
  for (const item of items) {
    if (item.id.startsWith("s:")) {
      const sampleKey = item.id.slice(2);
      if (!isSampleGarmentKey(sampleKey)) continue;
      const sample = SAMPLE_GARMENTS[sampleKey];
      rows.push({
        key: item.id,
        name: item.name || sample.name,
        category: sample.category,
        sampleKey,
        thumbUri: null,
        inCloset: inCloset.has(sampleKey),
        gone: false,
      });
    } else if (item.id.startsWith("g:")) {
      const garment = await readGarment(db, item.id.slice(2));
      const mine = garment?.closet === "mine";
      rows.push({
        key: item.id,
        name: item.name || garment?.name || "",
        category: garment?.category ?? "top",
        sampleKey: null,
        thumbUri: garment && mine ? await garmentMedia.resolve(garment.thumbPath) : null,
        inCloset: mine,
        gone: !mine,
      });
    }
  }
  return rows;
}

import { toKstDateString } from "@nuno/clock";
import { listLooks, type Look } from "@nuno/lookbook";
import {
  insertGarment,
  listClosetSampleKeys,
  type GarmentCategory,
  type GarmentColor,
} from "@nuno/wardrobe";
import { assetFileUri } from "../adapters/asset-file";
import { garmentMedia } from "../adapters/garment-media";
import { systemClock } from "../adapters/system-clock";
import { uuidGenerator } from "../adapters/uuid";
import { getDeviceDb } from "./device-db";
import { notifyClosetChanged } from "./wardrobe";

// 룩북: 저장한 룩을 읽고, 룩의 입은 옷(견본 옷)을 「담은 옷」 칸에 담는다.

export interface LookbookView {
  looks: Look[];
  /** 두 칸 어디든 남아 있는 견본 옷 키(입은 옷 시트 「옷장에 있음」) */
  inCloset: string[];
}

export async function loadLookbook(): Promise<LookbookView> {
  const { db } = await getDeviceDb();
  const [looks, inCloset] = await Promise.all([listLooks(db), listClosetSampleKeys(db)]);
  return { looks, inCloset };
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

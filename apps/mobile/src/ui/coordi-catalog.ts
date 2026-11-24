import {
  RECOMMENDED_LOOKS,
  refKey,
  SAMPLE_GARMENTS,
  sameOutfit,
  samplePiece,
  slotOf,
  type GarmentRef,
  type Outfit,
  type OutfitCategory,
  type OutfitPiece,
  type OutfitSlot,
  type SampleGarment,
  type SampleGarmentKey,
} from "@nuno/outfit";
import { DEFAULT_PLACEMENT, type BodySpot, type Placement } from "@nuno/wardrobe";
import type { ImageSourcePropType } from "react-native";
import type { GarmentDetail } from "../composition/wardrobe";
import { LOOK_PHOTOS, SAMPLE_GARMENT_IMAGES, SAMPLE_GARMENT_SIZES } from "./sample-assets";

/** 코디 화면이 옷 한 벌을 그리고 입히는 데 필요한 것. 옷장 옷과 견본 옷을 같은 꼴로 둔다. */
export interface CatalogItem {
  ref: GarmentRef;
  key: string;
  name: string;
  /** 코디 이름에 쓰는 짧은 이름. 옷장 옷은 이름 그대로다. */
  shortName: string;
  category: OutfitCategory;
  slot: OutfitSlot;
  /** 무대에 겹칠 누끼 */
  image: ImageSourcePropType;
  /** 누끼의 가로 / 세로 비율. 견본 옷만 미리 알고, 옷장 옷은 무대가 그림을 읽어 잰다. */
  aspect?: number;
  /** 옷 카드 그림 */
  thumb: ImageSourcePropType;
  placement: Placement;
  /** 견본 옷이 몸 위에 놓일 자리. 있으면 placement 대신 쓴다. */
  spot?: BodySpot;
  favorite: boolean;
  sample: boolean;
}

const SAMPLE_ITEMS: CatalogItem[] = (Object.keys(SAMPLE_GARMENTS) as SampleGarmentKey[]).map(
  (key) => {
    const piece = samplePiece(key);
    const garment: SampleGarment = SAMPLE_GARMENTS[key];
    const [width, height] = SAMPLE_GARMENT_SIZES[key];
    return {
      ref: piece.ref,
      key: refKey(piece.ref),
      name: garment.name,
      shortName: garment.short,
      category: piece.category,
      slot: piece.slot,
      image: SAMPLE_GARMENT_IMAGES[key],
      aspect: width / height,
      thumb: SAMPLE_GARMENT_IMAGES[key],
      placement: DEFAULT_PLACEMENT,
      spot: garment.stage,
      favorite: false,
      sample: true,
    };
  },
);

/** 옷장 옷(넣은 차례) 뒤에 견본 옷을 둔다. */
export function buildCatalog(garments: readonly GarmentDetail[]): CatalogItem[] {
  const mine = garments.map((garment): CatalogItem => {
    const ref: GarmentRef = { kind: "garment", id: garment.id };
    return {
      ref,
      key: refKey(ref),
      name: garment.name,
      shortName: garment.name,
      category: garment.category,
      slot: slotOf(garment.category),
      image: { uri: garment.cutoutUri },
      thumb: { uri: garment.thumbUri },
      placement: garment.placement ?? DEFAULT_PLACEMENT,
      favorite: garment.isFavorite,
      sample: false,
    };
  });
  return [...mine, ...SAMPLE_ITEMS];
}

export function pieceOf(item: CatalogItem): OutfitPiece {
  return { ref: item.ref, category: item.category, slot: item.slot };
}

/** 그 트윈이 이 코디를 실제로 입은 사진. 추천 코디와 같은 조합일 때만 있다. */
export function lookPhotoOf(twinKey: string, outfit: Outfit): ImageSourcePropType | undefined {
  const look = RECOMMENDED_LOOKS[twinKey]?.find((item) =>
    sameOutfit(item.items.map(samplePiece), outfit),
  );
  return look ? LOOK_PHOTOS[look.key] : undefined;
}

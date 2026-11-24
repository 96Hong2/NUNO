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
import { DEFAULT_PLACEMENT, type Placement } from "@nuno/wardrobe";
import type { ImageSourcePropType } from "react-native";
import type { GarmentDetail } from "../composition/wardrobe";
import { LOOK_PHOTOS, SAMPLE_GARMENT_IMAGES } from "./sample-assets";

/** 코디 화면이 옷 한 벌을 그리고 입히는 데 필요한 것. 옷장 옷과 견본 옷을 같은 꼴로 둔다. */
export interface CatalogItem {
  ref: GarmentRef;
  key: string;
  name: string;
  category: OutfitCategory;
  slot: OutfitSlot;
  /** 무대에 겹칠 누끼 */
  image: ImageSourcePropType;
  /** 옷 카드 그림 */
  thumb: ImageSourcePropType;
  placement: Placement;
  favorite: boolean;
  sample: boolean;
}

const SAMPLE_ITEMS: CatalogItem[] = (Object.keys(SAMPLE_GARMENTS) as SampleGarmentKey[]).map(
  (key) => {
    const piece = samplePiece(key);
    return {
      ref: piece.ref,
      key: refKey(piece.ref),
      name: SAMPLE_GARMENTS[key].name,
      category: piece.category,
      slot: piece.slot,
      image: SAMPLE_GARMENT_IMAGES[key],
      thumb: SAMPLE_GARMENT_IMAGES[key],
      placement: (SAMPLE_GARMENTS[key] as SampleGarment).fit ?? DEFAULT_PLACEMENT,
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

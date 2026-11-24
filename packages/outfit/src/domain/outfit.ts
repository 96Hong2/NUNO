/** 코디에 든 옷 한 벌이 가리키는 것: 옷장 옷(ID)이나 설치 파일 견본 옷(키). */
export type GarmentRef = { kind: "garment"; id: string } | { kind: "sample"; key: string };

/** 옷 종류. 옷장(wardrobe)과 같은 값이지만 이 컨텍스트가 따로 갖는다(컨텍스트끼리 import 하지 않는다). */
export type OutfitCategory = "outer" | "top" | "bottom" | "shoes" | "bag" | "acc";

/**
 * 무대에서 옷이 놓이는 자리. 액세서리는 어디에 두르느냐로 나눈다.
 * 다리(타이츠, 레깅스, 레그워머), 목(머플러), 손(장갑), 머리(모자, 머리띠).
 */
export type OutfitSlot =
  "legwear" | "shoes" | "bottom" | "top" | "outer" | "bag" | "hands" | "neck" | "head";

export interface OutfitPiece {
  ref: GarmentRef;
  category: OutfitCategory;
  slot: OutfitSlot;
}

/** 지금 입은 옷. 넣은 순서대로다(액세서리 셋 제한이 이 순서를 쓴다). */
export type Outfit = readonly OutfitPiece[];

/** 겹침 순서. 작을수록 아래에 그린다. 아래부터 다리, 신발, 하의, 상의, 아우터, 가방, 손, 목, 머리. */
const LAYER: Record<OutfitSlot, number> = {
  legwear: 0,
  shoes: 1,
  bottom: 2,
  top: 3,
  outer: 4,
  bag: 5,
  hands: 6,
  neck: 7,
  head: 8,
};

/** 액세서리는 3개까지 겹친다. 넷째를 넣으면 가장 먼저 넣은 것이 빠진다. */
export const MAX_ACCESSORIES = 3;

/** 액세서리가 아니면 종류가 곧 자리다. 액세서리 자리를 모르면 머리로 둔다. */
export function slotOf(category: OutfitCategory, accessorySlot?: OutfitSlot): OutfitSlot {
  return category === "acc" ? (accessorySlot ?? "head") : category;
}

export function sameRef(a: GarmentRef, b: GarmentRef): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === "garment"
      ? a.id === (b as { id: string }).id
      : a.key === (b as { key: string }).key)
  );
}

export function refKey(ref: GarmentRef): string {
  return ref.kind === "garment" ? `g:${ref.id}` : `s:${ref.key}`;
}

export function isWorn(outfit: Outfit, ref: GarmentRef): boolean {
  return outfit.some((piece) => sameRef(piece.ref, ref));
}

/**
 * 옷 카드를 눌렀을 때. 입은 옷이면 벗고, 아니면 입는다.
 * 액세서리가 아닌 종류는 같은 종류를 바꾸고, 액세서리는 셋까지 겹친다.
 */
export function toggleGarment(outfit: Outfit, piece: OutfitPiece): Outfit {
  if (isWorn(outfit, piece.ref)) return outfit.filter((item) => !sameRef(item.ref, piece.ref));
  if (piece.category !== "acc") {
    return [...outfit.filter((item) => item.category !== piece.category), piece];
  }
  const accessories = outfit.filter((item) => item.category === "acc");
  const dropped = accessories.length >= MAX_ACCESSORIES ? accessories[0] : undefined;
  return [...outfit.filter((item) => item !== dropped), piece];
}

/** 무대에 그릴 순서(아래부터). 같은 자리는 넣은 순서를 지킨다. */
export function layered(outfit: Outfit): OutfitPiece[] {
  return [...outfit].sort((a, b) => LAYER[a.slot] - LAYER[b.slot]);
}

/** 두 코디가 같은 옷으로 이뤄졌는지(순서는 보지 않는다). */
export function sameOutfit(a: Outfit, b: Outfit): boolean {
  if (a.length !== b.length) return false;
  return a.every((piece) => isWorn(b, piece.ref));
}

/** a 에만 있는 벌 수와 b 에만 있는 벌 수 */
export function outfitDiff(a: Outfit, b: Outfit): { removed: number; added: number } {
  return {
    removed: a.filter((piece) => !isWorn(b, piece.ref)).length,
    added: b.filter((piece) => !isWorn(a, piece.ref)).length,
  };
}

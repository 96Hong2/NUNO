import { slotOf, type OutfitCategory, type OutfitPiece, type OutfitSlot } from "./outfit";

// 설치 파일에 든 견본 옷과 추천 코디. 그림은 앱(apps/mobile/assets/sample-garments, looks)이 키로 찾는다.
// 견본 옷은 옷장 두 칸에 들지 않는다. 추천 코디와 온보딩 3단계가 쓴다.

export interface SampleGarment {
  name: string;
  category: OutfitCategory;
  /** 액세서리를 두르는 자리 */
  slot?: OutfitSlot;
}

export const SAMPLE_GARMENTS = {
  w01: { name: "아이보리 울 뉴스보이 캡", category: "acc", slot: "head" },
  w02: { name: "아이보리 퍼 칼라 벨티드 롱패딩", category: "outer" },
  w03: { name: "아이보리 퍼 와이드 팬츠", category: "bottom" },
  w04: { name: "아이보리 퍼 레이스업 부츠", category: "shoes" },
  w05: { name: "아이보리 퀼팅 미니 토트백", category: "bag" },
  w06: { name: "블랙 시어링 무스탕 자켓", category: "outer" },
  w07: { name: "베이지 골지 터틀넥 니트", category: "top" },
  w08: { name: "블랙 울 H라인 롱스커트", category: "bottom" },
  w09: { name: "블랙 불투명 타이츠", category: "acc", slot: "legwear" },
  w10: { name: "블랙 레더 롱부츠", category: "shoes" },
  w11: { name: "블랙 레더 미니 숄더백", category: "bag" },
  w14: { name: "화이트 코튼 미니스커트", category: "bottom" },
  w18: { name: "아이보리 케이프 벨티드 코트", category: "outer" },
  w19: { name: "블랙 레더 니하이 부츠", category: "shoes" },
  w20: { name: "아이보리 울 패딩 머리띠", category: "acc", slot: "head" },
  w21: { name: "그레이 더블 울 하프코트", category: "outer" },
  w22: { name: "차콜 단추 뉴스보이 캡", category: "acc", slot: "head" },
  w23: { name: "차콜 레깅스", category: "acc", slot: "legwear" },
  w24: { name: "블랙 단추 스트랩 롱부츠", category: "shoes" },
  w25: { name: "베이지 스웨이드 무스탕 자켓", category: "outer" },
  w26: { name: "크림 라운드넥 니트", category: "top" },
  w27: { name: "크림 프린지 머플러", category: "acc", slot: "neck" },
  w28: { name: "크림 티어드 시폰 롱스커트", category: "bottom" },
  w29: { name: "베이지 퍼 슬리퍼", category: "shoes" },
  w32: { name: "아이보리 핀턱 와이드 팬츠", category: "bottom" },
  w36: { name: "라벤더 후드 숏패딩", category: "outer" },
  w37: { name: "아이보리 니트 플리츠 미니", category: "bottom" },
  w38: { name: "차콜 기모 레깅스", category: "bottom" },
  w39: { name: "아이보리 니트 레그워머", category: "acc", slot: "legwear" },
  w40: { name: "베이지 퍼 트리밍 부츠", category: "shoes" },
  w41: { name: "크림 청키 니트 비니", category: "acc", slot: "head" },
  w42: { name: "베이지 스웨이드 시어링 코트", category: "outer" },
  w43: { name: "블랙 기모 레깅스", category: "bottom" },
  w44: { name: "베이지 양털 부츠", category: "shoes" },
  w45: { name: "크림 퍼 장갑", category: "acc", slot: "hands" },
  w46: { name: "블랙 울 베레모", category: "acc", slot: "head" },
  w47: { name: "차콜 더플 숏코트", category: "outer" },
  w48: { name: "블랙 플리츠 미니스커트", category: "bottom" },
  w49: { name: "라이트그레이 타이츠", category: "acc", slot: "legwear" },
  w50: { name: "블랙 스웨이드 벨트 롱부츠", category: "shoes" },
  w51: { name: "브라운 트위드 재킷", category: "outer" },
  w52: { name: "아이보리 골지 니트", category: "top" },
  w53: { name: "화이트 티어드 레이스 롱스커트", category: "bottom" },
  w54: { name: "레드 니트 후드 머플러", category: "acc", slot: "neck" },
  w55: { name: "브라운 레더 호보백", category: "bag" },
  w56: { name: "토프 스웨이드 미니 부츠", category: "shoes" },
  w57: { name: "그레이 버튼 하이넥 니트", category: "top" },
  w58: { name: "블랙 울 싱글 롱코트", category: "outer" },
  w59: { name: "블랙 울 쇼츠", category: "bottom" },
  w60: { name: "블랙 스웨이드 호보백", category: "bag" },
  w61: { name: "그레이 니트 레그워머", category: "acc", slot: "legwear" },
  w62: { name: "블랙 스웨이드 미들 부츠", category: "shoes" },
  w63: { name: "블랙 스웨이드 벨트 바게트백", category: "bag" },
  w64: { name: "블랙 프레피 플리츠 초미니", category: "bottom" },
  w65: { name: "블랙 스쿨 사첼백", category: "bag" },
} as const satisfies Record<string, SampleGarment>;

export type SampleGarmentKey = keyof typeof SAMPLE_GARMENTS;

export function isSampleGarmentKey(value: string): value is SampleGarmentKey {
  return value in SAMPLE_GARMENTS;
}

/** 견본 옷 한 벌을 코디에 넣을 꼴로 */
export function samplePiece(key: SampleGarmentKey): OutfitPiece {
  const garment: SampleGarment = SAMPLE_GARMENTS[key];
  return {
    ref: { kind: "sample", key },
    category: garment.category,
    slot: slotOf(garment.category, garment.slot),
  };
}

/**
 * 트윈마다 추천 코디 둘. 첫째가 기본 코디(홈 무대 사진의 코디)다. key 는 착장 사진 키이기도 하다.
 * 트윈 키는 twin 컨텍스트의 프리셋 키와 같은 글자다.
 */
export const RECOMMENDED_LOOKS: Record<
  string,
  readonly { key: string; items: readonly SampleGarmentKey[] }[]
> = {
  yuna: [
    { key: "yuna-co", items: ["w36", "w37", "w38", "w39", "w40", "w41"] },
    { key: "yuna-d1", items: ["w25", "w26", "w28", "w27", "w29"] },
  ],
  harin: [
    { key: "harin-p07", items: ["w47", "w48", "w49", "w50", "w46", "w63"] },
    { key: "harin-co", items: ["w21", "w22", "w64", "w23", "w24", "w65"] },
  ],
  serin: [
    { key: "serin-co", items: ["w06", "w07", "w08", "w09", "w10", "w11"] },
    { key: "serin-d1", items: ["w25", "w26", "w28", "w27", "w29"] },
  ],
  moa: [
    { key: "moa-co", items: ["w42", "w43", "w44", "w45"] },
    { key: "moa-d5", items: ["w02", "w03", "w01", "w04", "w05"] },
  ],
  lulu: [
    { key: "lulu-co", items: ["w58", "w57", "w59", "w61", "w62", "w60"] },
    { key: "lulu-d7", items: ["w51", "w52", "w53", "w54", "w55", "w56"] },
  ],
  noel: [
    { key: "noel-co", items: ["w18", "w19", "w20"] },
    { key: "noel-d5", items: ["w02", "w03", "w01", "w04", "w05"] },
  ],
};

/** 그 트윈의 기본 코디(추천 코디 첫째) */
export function defaultOutfit(twinKey: string): OutfitPiece[] {
  return (RECOMMENDED_LOOKS[twinKey]?.[0]?.items ?? []).map(samplePiece);
}

/** 온보딩 「입고 싶은 옷을 골라 보세요」 견본: 아우터 셋, 하의 셋과 카드 이름 */
export const ONBOARDING_SAMPLES = {
  outer: [
    { key: "w18", label: "케이프 코트" },
    { key: "w21", label: "더블 하프코트" },
    { key: "w36", label: "후드 숏패딩" },
  ],
  bottom: [
    { key: "w14", label: "코튼 미니" },
    { key: "w28", label: "티어드 롱스커트" },
    { key: "w32", label: "와이드 팬츠" },
  ],
} as const satisfies Record<
  "outer" | "bottom",
  readonly { key: SampleGarmentKey; label: string }[]
>;

/**
 * 홈 「오늘 코디」 와 내 코디 「오늘 뭐 입지」 가 입히는 추천 코디. 날짜(사용자 시간대의 YYYY-MM-DD)마다 돌아가며 고른다.
 */
export function todayLook(
  twinKey: string,
  localDate: string,
): { key: string; items: readonly SampleGarmentKey[] } | undefined {
  const looks = RECOMMENDED_LOOKS[twinKey];
  if (!looks?.length) return undefined;
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return looks[((dayNumber % looks.length) + looks.length) % looks.length];
}

import {
  sameOutfit,
  slotOf,
  type Outfit,
  type OutfitCategory,
  type OutfitPiece,
  type OutfitSlot,
} from "./outfit";

// 설치 파일에 든 견본 옷과 추천 코디. 그림은 앱(apps/mobile/assets/sample-garments, looks)이 키로 찾는다.
// 견본 옷은 옷장 두 칸에 들지 않는다. 추천 코디와 온보딩 3단계가 쓴다.

export interface SampleGarment {
  name: string;
  /** 코디 이름에 쓰는 짧은 이름 */
  short: string;
  category: OutfitCategory;
  /** 액세서리를 두르는 자리 */
  slot?: OutfitSlot;
  /** 몸 위에 놓일 자리. 없으면 옷장 옷처럼 기준 상자에 맞춘다(가방, 장갑, 머플러). */
  stage?: SampleStage;
}

/**
 * 와이어프레임 v26 무대 자리 값(FXB)을 그대로 옮긴 것. 와이어프레임 기준 몸의 백분율이다.
 * top 은 그림 위 끝, bottom 은 아래 끝, width 는 그림 폭, centerX 는 가로 가운데다.
 */
export interface SampleStage {
  top: number;
  bottom: number;
  width: number;
  centerX?: number;
}

// 이름과 짧은 이름, 무대 자리는 와이어프레임 v26 상품 표(IT)와 무대 자리 값(FXB)에서 옮겼다.
/* prettier-ignore */
export const SAMPLE_GARMENTS = {
  w01: { name: "아이보리 울 뉴스보이 캡", short: "뉴스보이 캡", category: "acc", slot: "head", stage: { top: 0.8, bottom: 7.8, width: 19, centerX: 49 } },
  w02: { name: "아이보리 퍼 칼라 벨티드 롱패딩", short: "벨티드 롱패딩", category: "outer", stage: { top: 14.5, bottom: 88, width: 40 } },
  w03: { name: "아이보리 퍼 와이드 팬츠", short: "퍼 와이드 팬츠", category: "bottom", stage: { top: 41.5, bottom: 95, width: 34 } },
  w04: { name: "아이보리 퍼 레이스업 부츠", short: "퍼 레이스업 부츠", category: "shoes", stage: { top: 86, bottom: 98.8, width: 20 } },
  w05: { name: "아이보리 퀼팅 미니 토트백", short: "퀼팅 미니 토트", category: "bag" },
  w06: { name: "블랙 시어링 무스탕 자켓", short: "무스탕 자켓", category: "outer", stage: { top: 15.5, bottom: 49, width: 41 } },
  w07: { name: "베이지 골지 터틀넥 니트", short: "골지 터틀넥", category: "top", stage: { top: 15.5, bottom: 46, width: 36 } },
  w08: { name: "블랙 울 H라인 롱스커트", short: "H라인 롱스커트", category: "bottom", stage: { top: 41.5, bottom: 84, width: 28 } },
  w09: { name: "블랙 불투명 타이츠", short: "블랙 타이츠", category: "acc", slot: "legwear", stage: { top: 41.5, bottom: 97, width: 22 } },
  w10: { name: "블랙 레더 롱부츠", short: "레더 롱부츠", category: "shoes", stage: { top: 72, bottom: 98.6, width: 22.5 } },
  w11: { name: "블랙 레더 미니 숄더백", short: "미니 숄더백", category: "bag" },
  w12: { name: "스카이블루 퍼 크롭 자켓", short: "퍼 크롭 자켓", category: "outer", stage: { top: 15.5, bottom: 46, width: 44 } },
  w13: { name: "아이보리 리본 프릴넥 니트", short: "리본 프릴넥 니트", category: "top", stage: { top: 16, bottom: 46, width: 36 } },
  w14: { name: "화이트 코튼 미니스커트", short: "코튼 미니", category: "bottom", stage: { top: 41.5, bottom: 55, width: 28 } },
  w15: { name: "화이트 플라워 레이스 스타킹", short: "레이스 스타킹", category: "acc", slot: "legwear", stage: { top: 41.5, bottom: 97, width: 22 } },
  w16: { name: "아이보리 롱 퍼 부츠", short: "롱 퍼 부츠", category: "shoes", stage: { top: 74, bottom: 98.6, width: 23 } },
  w17: { name: "아이보리 퀼팅 체인 크로스백", short: "체인 크로스백", category: "bag" },
  w18: { name: "아이보리 케이프 벨티드 코트", short: "케이프 코트", category: "outer", stage: { top: 14.5, bottom: 58, width: 42 } },
  w19: { name: "블랙 레더 니하이 부츠", short: "니하이 부츠", category: "shoes", stage: { top: 71, bottom: 98.6, width: 22.5 } },
  w20: { name: "아이보리 울 패딩 머리띠", short: "패딩 머리띠", category: "acc", slot: "head", stage: { top: 4.2, bottom: 8.6, width: 15, centerX: 49 } },
  w21: { name: "그레이 더블 울 하프코트", short: "더블 하프코트", category: "outer", stage: { top: 15, bottom: 53, width: 45 } },
  w22: { name: "차콜 단추 뉴스보이 캡", short: "뉴스보이 캡", category: "acc", slot: "head", stage: { top: 1.6, bottom: 8.8, width: 19, centerX: 49 } },
  w23: { name: "차콜 레깅스", short: "차콜 레깅스", category: "acc", slot: "legwear", stage: { top: 41.5, bottom: 93, width: 23 } },
  w24: { name: "블랙 단추 스트랩 롱부츠", short: "스트랩 롱부츠", category: "shoes", stage: { top: 73, bottom: 98.6, width: 21 } },
  w25: { name: "베이지 스웨이드 무스탕 자켓", short: "스웨이드 무스탕", category: "outer", stage: { top: 15.5, bottom: 48, width: 41 } },
  w26: { name: "크림 라운드넥 니트", short: "라운드 니트", category: "top", stage: { top: 17.5, bottom: 47, width: 38 } },
  w27: { name: "크림 프린지 머플러", short: "프린지 머플러", category: "acc", slot: "neck", stage: { top: 15, bottom: 40, width: 18, centerX: 50 } },
  w28: { name: "크림 티어드 시폰 롱스커트", short: "티어드 롱스커트", category: "bottom", stage: { top: 41.5, bottom: 90, width: 38 } },
  w29: { name: "베이지 퍼 슬리퍼", short: "퍼 슬리퍼", category: "shoes", stage: { top: 89.5, bottom: 98.8, width: 19 } },
  w30: { name: "오트밀 울 후드 더플코트", short: "후드 더플코트", category: "outer", stage: { top: 8.5, bottom: 70, width: 40 } },
  w31: { name: "스카이 골지 슬림 니트", short: "골지 슬림 니트", category: "top", stage: { top: 17.5, bottom: 46, width: 36 } },
  w32: { name: "아이보리 핀턱 와이드 팬츠", short: "와이드 팬츠", category: "bottom", stage: { top: 41.5, bottom: 95, width: 33 } },
  w33: { name: "그레이 펠트 토트백", short: "펠트 토트백", category: "bag" },
  w34: { name: "아이보리 시어링 버킷햇", short: "버킷햇", category: "acc", slot: "head", stage: { top: 0.4, bottom: 8.8, width: 20, centerX: 49 } },
  w35: { name: "아이보리 퍼 미니 부츠", short: "퍼 미니 부츠", category: "shoes", stage: { top: 87, bottom: 98.8, width: 19 } },
  w36: { name: "라벤더 후드 숏패딩", short: "후드 숏패딩", category: "outer", stage: { top: 13.5, bottom: 47, width: 42 } },
  w37: { name: "아이보리 니트 플리츠 미니", short: "니트 플리츠 미니", category: "bottom", stage: { top: 41.5, bottom: 56, width: 30 } },
  w38: { name: "차콜 기모 레깅스", short: "기모 레깅스", category: "acc", slot: "legwear", stage: { top: 41.5, bottom: 94, width: 22 } },
  w39: { name: "아이보리 니트 레그워머", short: "니트 레그워머", category: "acc", slot: "legwear", stage: { top: 76, bottom: 95, width: 19 } },
  w40: { name: "베이지 퍼 트리밍 부츠", short: "퍼 트리밍 부츠", category: "shoes", stage: { top: 84, bottom: 98.6, width: 21 } },
  w41: { name: "크림 청키 니트 비니", short: "청키 비니", category: "acc", slot: "head", stage: { top: 0.6, bottom: 7.6, width: 16, centerX: 49 } },
  w42: { name: "베이지 스웨이드 시어링 코트", short: "시어링 코트", category: "outer", stage: { top: 15.5, bottom: 54, width: 42 } },
  w43: { name: "블랙 기모 레깅스", short: "블랙 레깅스", category: "bottom", stage: { top: 41.5, bottom: 94, width: 22 } },
  w44: { name: "베이지 양털 부츠", short: "양털 부츠", category: "shoes", stage: { top: 83, bottom: 98.6, width: 21 } },
  w45: { name: "크림 퍼 장갑", short: "퍼 장갑", category: "acc", slot: "hands" },
  w46: { name: "블랙 울 베레모", short: "베레모", category: "acc", slot: "head", stage: { top: 0.8, bottom: 7, width: 20, centerX: 49 } },
  w47: { name: "차콜 더플 숏코트", short: "더플 숏코트", category: "outer", stage: { top: 15.5, bottom: 50, width: 40 } },
  w48: { name: "블랙 플리츠 미니스커트", short: "플리츠 미니", category: "bottom", stage: { top: 41.5, bottom: 56, width: 29 } },
  w49: { name: "라이트그레이 타이츠", short: "그레이 타이츠", category: "acc", slot: "legwear", stage: { top: 41.5, bottom: 97, width: 22 } },
  w50: { name: "블랙 스웨이드 벨트 롱부츠", short: "스웨이드 롱부츠", category: "shoes", stage: { top: 72, bottom: 98.6, width: 23 } },
  w51: { name: "브라운 트위드 재킷", short: "트위드 재킷", category: "outer", stage: { top: 15.5, bottom: 50, width: 39 } },
  w52: { name: "아이보리 골지 니트", short: "골지 니트", category: "top", stage: { top: 17.5, bottom: 47, width: 36 } },
  w53: { name: "화이트 티어드 레이스 롱스커트", short: "레이스 롱스커트", category: "bottom", stage: { top: 41.5, bottom: 91, width: 36 } },
  w54: { name: "레드 니트 후드 머플러", short: "후드 머플러", category: "acc", slot: "neck" },
  w55: { name: "브라운 레더 호보백", short: "레더 호보백", category: "bag" },
  w56: { name: "토프 스웨이드 미니 부츠", short: "스웨이드 미니 부츠", category: "shoes", stage: { top: 87, bottom: 98.8, width: 19 } },
  w57: { name: "그레이 버튼 하이넥 니트", short: "하이넥 니트", category: "top", stage: { top: 16, bottom: 47, width: 38 } },
  w58: { name: "블랙 울 싱글 롱코트", short: "울 롱코트", category: "outer", stage: { top: 15.5, bottom: 74, width: 38 } },
  w59: { name: "블랙 울 쇼츠", short: "울 쇼츠", category: "bottom", stage: { top: 41.5, bottom: 55, width: 30 } },
  w60: { name: "블랙 스웨이드 호보백", short: "스웨이드 호보백", category: "bag" },
  w61: { name: "그레이 니트 레그워머", short: "그레이 레그워머", category: "acc", slot: "legwear", stage: { top: 76, bottom: 95, width: 19 } },
  w62: { name: "블랙 스웨이드 미들 부츠", short: "미들 부츠", category: "shoes", stage: { top: 82, bottom: 98.6, width: 21 } },
  w63: { name: "블랙 스웨이드 벨트 바게트백", short: "벨트 바게트백", category: "bag" },
  w64: { name: "블랙 프레피 플리츠 초미니", short: "플리츠 초미니", category: "bottom", stage: { top: 41.5, bottom: 55, width: 27 } },
  w65: { name: "블랙 스쿨 사첼백", short: "스쿨 사첼백", category: "bag" },
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

/** 추천 코디 한 벌. key 는 착장 사진 키이고, name 은 코디 카드와 알림에 쓰는 이름이다. */
export interface RecommendedLook {
  key: string;
  name: string;
  items: readonly SampleGarmentKey[];
  /** 홈 「오늘 코디」 와 내 코디 「오늘 뭐 입지」 가 입히는 룩 */
  today?: boolean;
}

/**
 * 트윈마다 그 트윈이 실제로 입은 겨울 룩. 첫째가 기본 코디(홈 무대 사진의 코디)다.
 * 순서와 이름은 와이어프레임 v26 룩 목록(LOOK10, LK22P)을 따른다.
 * 트윈 키는 twin 컨텍스트의 프리셋 키와 같은 글자다.
 */
/* prettier-ignore */
export const RECOMMENDED_LOOKS: Record<string, readonly RecommendedLook[]> = {
  yuna: [
    { key: "yuna-co", name: "라벤더 숏패딩과 니트 미니", items: ["w36", "w37", "w38", "w39", "w40", "w41"] },
    { key: "yuna-d1", name: "스웨이드 무스탕과 티어드 롱스커트", items: ["w25", "w26", "w28", "w27", "w29"] },
    { key: "yuna-up", name: "오트밀 더플과 와이드 팬츠", items: ["w30", "w31", "w32", "w34", "w33", "w35"] },
    { key: "yuna-p04", name: "차콜 더플 코트와 플리츠 미니", items: ["w47", "w48", "w49", "w50", "w46", "w63"] },
    { key: "yuna-p06", name: "스카이 퍼 자켓과 화이트 미니", items: ["w12", "w13", "w14", "w15", "w16", "w17"] },
    { key: "yuna-today", name: "케이프 트렌치와 롱부츠", items: ["w18", "w19", "w20"], today: true },
  ],
  harin: [
    { key: "harin-p07", name: "차콜 더플 코트와 플리츠 미니", items: ["w47", "w48", "w49", "w50", "w46", "w63"] },
    { key: "harin-co", name: "그레이 더블 코트와 블랙 초미니", items: ["w21", "w22", "w64", "w23", "w24", "w65"] },
    { key: "harin-d3", name: "스카이 퍼 자켓과 화이트 미니", items: ["w12", "w13", "w14", "w15", "w16", "w17"] },
    { key: "harin-n1", name: "케이프 트렌치와 롱부츠", items: ["w18", "w19", "w20"], today: true },
    { key: "harin-n3", name: "스웨이드 무스탕과 티어드 롱스커트", items: ["w25", "w26", "w28", "w27", "w29"] },
    { key: "harin-n4", name: "오트밀 더플과 와이드 팬츠", items: ["w30", "w31", "w32", "w34", "w33", "w35"] },
    { key: "harin-n5", name: "라벤더 숏패딩과 니트 미니", items: ["w36", "w37", "w38", "w39", "w40", "w41"] },
    { key: "harin-n6", name: "시어링 코트와 블랙 레깅스", items: ["w42", "w43", "w44", "w45"] },
    { key: "harin-n8", name: "트위드 재킷과 레이스 롱스커트", items: ["w51", "w52", "w53", "w54", "w55", "w56"] },
    { key: "harin-n9", name: "블랙 롱코트와 울 쇼츠", items: ["w58", "w57", "w59", "w61", "w62", "w60"] },
    { key: "harin-k5", name: "블랙 무스탕과 H라인 롱스커트", items: ["w06", "w07", "w08", "w09", "w10", "w11"] },
    { key: "harin-k11", name: "아이보리 롱패딩과 퍼 팬츠", items: ["w02", "w03", "w01", "w04", "w05"] },
  ],
  serin: [
    { key: "serin-co", name: "블랙 무스탕과 H라인 롱스커트", items: ["w06", "w07", "w08", "w09", "w10", "w11"] },
    { key: "serin-d1", name: "스웨이드 무스탕과 티어드 롱스커트", items: ["w25", "w26", "w28", "w27", "w29"] },
    { key: "serin-ps1", name: "트위드 재킷과 레이스 롱스커트", items: ["w51", "w52", "w53", "w54", "w55", "w56"] },
    { key: "serin-today", name: "케이프 트렌치와 롱부츠", items: ["w18", "w19", "w20"], today: true },
  ],
  moa: [
    { key: "moa-co", name: "시어링 코트와 블랙 레깅스", items: ["w42", "w43", "w44", "w45"] },
    { key: "moa-d5", name: "아이보리 롱패딩과 퍼 팬츠", items: ["w02", "w03", "w01", "w04", "w05"] },
    { key: "moa-today", name: "케이프 트렌치와 롱부츠", items: ["w18", "w19", "w20"], today: true },
  ],
  lulu: [
    { key: "lulu-co", name: "블랙 롱코트와 울 쇼츠", items: ["w58", "w57", "w59", "w61", "w62", "w60"] },
    { key: "lulu-d7", name: "트위드 재킷과 레이스 롱스커트", items: ["w51", "w52", "w53", "w54", "w55", "w56"] },
    { key: "lulu-pl1", name: "블랙 무스탕과 H라인 롱스커트", items: ["w06", "w07", "w08", "w09", "w10", "w11"] },
  ],
  noel: [
    { key: "noel-co", name: "케이프 트렌치와 롱부츠", items: ["w18", "w19", "w20"] },
    { key: "noel-d5", name: "아이보리 롱패딩과 퍼 팬츠", items: ["w02", "w03", "w01", "w04", "w05"] },
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
 * 홈 「오늘 코디」 와 내 코디 「오늘 뭐 입지」 가 입히는 룩.
 * 트윈마다 정해 둔 오늘 룩이고, 없으면 기본 코디 다음 룩이다. 기본 코디는 고르지 않는다.
 */
export function twinTodayLook(twinKey: string): RecommendedLook | undefined {
  const looks = RECOMMENDED_LOOKS[twinKey] ?? [];
  return looks.find((look) => look.today) ?? looks[1];
}

/**
 * 날짜(사용자 시간대의 YYYY-MM-DD)마다 기본 코디와 둘째 룩을 번갈아 고른다.
 * 화면은 쓰지 않는다. 오늘 룩은 twinTodayLook 이 정한다.
 */
export function todayLook(twinKey: string, localDate: string): RecommendedLook | undefined {
  const looks = (RECOMMENDED_LOOKS[twinKey] ?? []).slice(0, 2);
  if (!looks.length) return undefined;
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return looks[((dayNumber % looks.length) + looks.length) % looks.length];
}

/** 추천 코디와 같은 조합이면 그 룩 이름(트윈과 상관없이 옷이 같으면 같은 이름이다) */
export function lookName(outfit: Outfit): string | undefined {
  for (const looks of Object.values(RECOMMENDED_LOOKS)) {
    const look = looks.find((item) => sameOutfit(item.items.map(samplePiece), outfit));
    if (look) return look.name;
  }
  return undefined;
}

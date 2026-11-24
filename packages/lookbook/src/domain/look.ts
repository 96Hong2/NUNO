import { toKstDateString } from "@nuno/clock";

// 룩: 룩북에 저장한 코디 한 장. 입은 옷은 저장할 때의 사본이라 옷장에서 옷을 지워도 그대로다.

/** 룩의 입은 옷 한 벌. 옷장 판에서는 견본 옷만 룩이 된다(온보딩 「첫 코디」). */
export interface LookItem {
  /** 견본 옷 키(설치 파일 그림). outfit 컨텍스트의 견본 키와 같은 글자다 */
  sampleKey: string;
  /** 옷 종류(outer, top, bottom, shoes, bag, acc) */
  category: string;
  /** 무대 자리. 사진이 없는 룩을 무대처럼 겹쳐 그릴 때 쓴다 */
  slot: string;
  name: string;
}

export interface Look {
  id: string;
  title: string;
  twinKey: string;
  /** 착장 사진 키. 없으면 입은 옷을 그 트윈 위에 겹쳐 그린다 */
  photoKey: string | null;
  /** ISO 시각 */
  createdAt: string;
  items: LookItem[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * 카드의 저장 시점 글. 한 시간 안이면 「방금 저장」, 같은 한국 날짜면 「오늘 저장」, 그 밖에는 「N일 전 저장」.
 * 날짜 차이는 한국 날짜로 센다.
 */
export function savedAgoLabel(createdAt: string, now: Date): string {
  const created = new Date(createdAt);
  if (now.getTime() - created.getTime() < HOUR_MS) return "방금 저장";
  const days = Math.round(
    (Date.parse(toKstDateString(now)) - Date.parse(toKstDateString(created))) / DAY_MS,
  );
  return days <= 0 ? "오늘 저장" : `${days}일 전 저장`;
}

// 룩의 「입은 옷」 시트에서 고른 옷에 따라 달라지는 글자와 단추.

export interface WornSheetState {
  /** 단추 위 안내 줄 */
  line: string;
  /** 왼쪽 단추. 고른 옷 가운데 옷장에 없는 옷이 있으면 「옷장에 담기 N」 */
  closet: { label: string; active: boolean };
  /** 오른쪽 단추 「트윈에 입혀 보기 N」 */
  wear: { label: string; active: boolean };
}

/**
 * picked 는 고른 옷 수, missing 은 그 가운데 옷장에 없는 옷 수다.
 * 아무것도 고르지 않으면 두 단추 모두 회색이고, 고른 옷이 모두 옷장에 있으면 왼쪽은 회색 「모두 옷장에 있어요」 다.
 */
export function wornSheetState(picked: number, missing: number): WornSheetState {
  if (picked === 0) {
    return {
      line: "옷을 골라 한꺼번에 입혀 보거나 옷장에 담아요",
      closet: { label: "옷장에 담기", active: false },
      wear: { label: "트윈에 입혀 보기", active: false },
    };
  }
  return {
    line: `${picked}벌 골랐어요`,
    closet:
      missing > 0
        ? { label: `옷장에 담기 ${missing}`, active: true }
        : { label: "모두 옷장에 있어요", active: false },
    wear: { label: `트윈에 입혀 보기 ${picked}`, active: true },
  };
}

/** 「옷장에 담기」 뒤 알림. 이미 있는 옷이 없으면 뒤 문장을 붙이지 않는다 */
export function closetSavedMessage(added: number, already: number): string {
  const head = `${added}벌을 옷장에 담았어요`;
  return already > 0 ? `${head}. ${already}벌은 이미 있어요` : head;
}

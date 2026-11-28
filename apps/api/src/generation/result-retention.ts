/**
 * 룩북에 저장하지 않은 결과(gen30)의 보관 기한이 지났으면 참이다. 기한이 비어 있으면 지나지 않은 것으로 본다.
 * 조회는 주소를 주지 않고, 저장은 복사하지 않는다. DB 함수 nuno_keep_result 도 같은 기준으로 거절한다.
 */
export const isPastRetention = (deleteDueAt: Date | null, now: Date): boolean =>
  deleteDueAt !== null && deleteDueAt.getTime() <= now.getTime();

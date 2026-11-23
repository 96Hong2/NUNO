/** 지금 시각을 주는 포트. 실제 구현은 앱 어댑터에, 시험 대역은 `@nuno/clock/testing` 에 있다. */
export interface Clock {
  now(): Date;
}

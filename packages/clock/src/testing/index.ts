import type { Clock } from "../clock";

export interface FixedClock extends Clock {
  /** 시계를 앞으로 돌린다. 음수면 뒤로 간다. */
  advance(ms: number): void;
}

/** 시험에서만 쓰는 시계. 주어진 시각에 멈춰 있다가 `advance` 로만 움직인다. */
export function fixedClock(start: string | Date): FixedClock {
  let current = new Date(start).getTime();
  if (Number.isNaN(current)) {
    throw new RangeError(`유효하지 않은 시작 시각: ${String(start)}`);
  }
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
  };
}

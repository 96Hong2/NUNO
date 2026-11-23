import type { Clock } from "@nuno/clock";

/** 기기 시계. 도메인에는 이 값을 인자로 넘긴다. */
export const systemClock: Clock = { now: () => new Date() };

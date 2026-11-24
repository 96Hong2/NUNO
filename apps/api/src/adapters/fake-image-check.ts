import type { ImageCheck } from "../generation/ports.ts";

/** 늘 통과하는 가짜 출력 검사. 검사 회사가 정해지면 진짜 어댑터로 바꾼다. */
export function createFakeImageCheck(): ImageCheck {
  return { check: () => Promise.resolve("pass") };
}

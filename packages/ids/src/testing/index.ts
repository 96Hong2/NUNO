import type { IdGenerator } from "../domain/id-generator";

/** 시험에서만 쓰는 ID. `prefix-1`, `prefix-2` 처럼 부른 순서대로 나온다. */
export function sequentialIds(prefix = "id"): IdGenerator {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `${prefix}-${count}`;
    },
  };
}

/** 새 ID 를 주는 포트. 기기에서는 UUID 어댑터를, 시험에서는 `@nuno/ids/testing` 의 순번 ID 를 꽂는다. */
export interface IdGenerator {
  next(): string;
}

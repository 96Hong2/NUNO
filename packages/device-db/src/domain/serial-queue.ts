/**
 * 비동기 작업을 들어온 순서대로 하나씩 돌린다. 어댑터가 연결 하나를 나눠 쓸 때 쓴다.
 * 앞 작업이 실패해도 다음 작업은 돈다.
 */
export interface SerialQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

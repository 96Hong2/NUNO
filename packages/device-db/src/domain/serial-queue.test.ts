import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serial-queue";

describe("createSerialQueue", () => {
  it("앞 작업이 끝난 뒤에 다음 작업을 시작한다", async () => {
    const queue = createSerialQueue();
    const events: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await gate;
      events.push("first:end");
    });
    const second = queue.run(() => {
      events.push("second");
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("앞 작업이 실패해도 다음 작업은 돈다", async () => {
    const queue = createSerialQueue();
    const failed = queue.run(() => Promise.reject(new Error("앞 작업 실패")));
    const next = queue.run(() => Promise.resolve("다음"));
    await expect(failed).rejects.toThrow("앞 작업 실패");
    await expect(next).resolves.toBe("다음");
  });
});

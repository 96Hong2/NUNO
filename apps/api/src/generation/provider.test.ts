import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import { callProvider, PROVIDER_TIMEOUT_MS, type GenerationRequest } from "./provider.ts";

const request: GenerationRequest = { twinImage: new Uint8Array(), garmentImages: [], prompt: "" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("생성 공급사 부르기", () => {
  it("가짜 공급사가 그림을 주면 결과와 청구액이 온다", async () => {
    const outcome = await callProvider(createFakeProvider("succeed", 0.04), request);
    expect(outcome).toMatchObject({ kind: "succeeded", mimeType: "image/jpeg", costUsd: 0.04 });
  });

  it("거절하면 거절 사유가 온다", async () => {
    expect(await callProvider(createFakeProvider("refuse"), request)).toMatchObject({
      kind: "refused",
      reason: "safety",
    });
  });

  it("150초 동안 답이 없으면 요청을 끊고 무응답이 온다", async () => {
    const pending = callProvider(createFakeProvider("hang"), request, { now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: "timed_out", elapsedMs: PROVIDER_TIMEOUT_MS });
  });
});

import type { GenerationProvider, ProviderAnswer } from "../generation/provider.ts";

/** 가짜 공급사가 할 일: 그림 주기, 거절하기, 끊길 때까지 답하지 않기. */
export type FakeBehavior = "succeed" | "refuse" | "hang";

export interface FakeProviderOptions {
  /** 답하기 전에 기다리는 밀리초. 만드는 중 화면을 시험할 때 쓴다. */
  delayMs?: number;
  /** 결과로 줄 그림 바이트. 없으면 1x1 흰 JPEG 다. */
  image?: Uint8Array;
  mimeType?: string;
}

/** 1x1 흰 JPEG. 가짜 결과 그림이다. */
const WHITE_PIXEL_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  ),
  (char) => char.charCodeAt(0),
);

/** 지연 뒤에 끝난다. 끊기면 기다리지 않고 거절한다. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("요청을 끊었다"));
      },
      { once: true },
    );
  });
}

/** 정한 대로만 답하는 가짜 공급사. 시험과 개발 서버에서 쓴다. */
export function createFakeProvider(
  behavior: FakeBehavior,
  costUsd = 0.04,
  { delayMs = 0, image = WHITE_PIXEL_JPEG, mimeType = "image/jpeg" }: FakeProviderOptions = {},
): GenerationProvider {
  return {
    name: `fake-${behavior}`,
    async generate(_request, signal): Promise<ProviderAnswer> {
      if (behavior === "hang") {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("요청을 끊었다")), {
            once: true,
          });
        });
      }
      await wait(delayMs, signal);
      if (behavior === "succeed") return { kind: "succeeded", image, mimeType, costUsd };
      return { kind: "refused", reason: "safety" };
    },
  };
}

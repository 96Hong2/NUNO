import type { GenerationProvider, ProviderAnswer } from "../generation/provider.ts";

/** 가짜 공급사가 할 일: 그림 주기, 거절하기, 끊길 때까지 답하지 않기. */
export type FakeBehavior = "succeed" | "refuse" | "hang";

/** 1x1 흰 JPEG. 가짜 결과 그림이다. */
const WHITE_PIXEL_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  ),
  (char) => char.charCodeAt(0),
);

/** 정한 대로만 답하는 가짜 공급사. 시험과 개발 서버의 「이대로 입히기」 끈 상태에서 쓴다. */
export function createFakeProvider(behavior: FakeBehavior, costUsd = 0.04): GenerationProvider {
  return {
    name: `fake-${behavior}`,
    generate(_request, signal): Promise<ProviderAnswer> {
      if (behavior === "succeed") {
        return Promise.resolve({
          kind: "succeeded",
          image: WHITE_PIXEL_JPEG,
          mimeType: "image/jpeg",
          costUsd,
        });
      }
      if (behavior === "refuse") return Promise.resolve({ kind: "refused", reason: "safety" });
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("요청을 끊었다")), { once: true });
      });
    },
  };
}

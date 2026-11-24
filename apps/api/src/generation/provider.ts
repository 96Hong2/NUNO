/** 생성 공급사에 넘기는 요청. 그림은 JPEG 바이트다. */
export interface GenerationRequest {
  twinImage: Uint8Array;
  garmentImages: Uint8Array[];
  prompt: string;
}

/** 공급사가 직접 돌려주는 답: 그림을 주거나, 안전 검사로 거절한다. */
export type ProviderAnswer =
  | { kind: "succeeded"; image: Uint8Array; mimeType: string; costUsd: number }
  | { kind: "refused"; reason: string };

/** 생성 공급사 포트. 진짜(Seedream, GPT-Image)와 가짜가 같은 꼴을 구현한다. signal 이 끊기면 요청을 멈춘다. */
export interface GenerationProvider {
  readonly name: string;
  generate(request: GenerationRequest, signal: AbortSignal): Promise<ProviderAnswer>;
}

/** 한 번 부르기의 시한. 넘으면 무응답으로 보고 요청을 끊는다. */
export const PROVIDER_TIMEOUT_MS = 150_000;

/** 부르기 결과. 무응답은 공급사가 답하지 않은 경우다. elapsedMs 는 응답 시간(p95 집계용)이다. */
export type ProviderOutcome =
  (ProviderAnswer & { elapsedMs: number }) | { kind: "timed_out"; elapsedMs: number };

export interface CallOptions {
  timeoutMs?: number;
  /** 밀리초 시계. 시험에서 가짜 시계를 꽂는다. */
  now?: () => number;
}

/** 공급사를 한 번 부른다. 시한이 지나면 요청을 끊고 timed_out 을 낸다. 공급사 오류는 그대로 던진다. */
export async function callProvider(
  provider: GenerationProvider,
  request: GenerationRequest,
  { timeoutMs = PROVIDER_TIMEOUT_MS, now = Date.now }: CallOptions = {},
): Promise<ProviderOutcome> {
  const started = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const answer = await Promise.race([provider.generate(request, controller.signal), timeout]);
    if (answer === "timeout") {
      controller.abort();
      return { kind: "timed_out", elapsedMs: now() - started };
    }
    return { ...answer, elapsedMs: now() - started };
  } finally {
    clearTimeout(timer);
  }
}

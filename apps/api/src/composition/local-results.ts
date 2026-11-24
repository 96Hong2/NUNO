import { createLocalResultStore, type LocalResultStore } from "../adapters/local-result-store.ts";

/** NUNO_RESULT_DIR 가 없을 때의 결과 사진 폴더(apps/api/.local-results). 저장소에 올리지 않는다. */
const DEFAULT_RESULT_DIR = new URL("../../.local-results", import.meta.url).pathname;

export interface LocalResults {
  store: LocalResultStore;
  secret: string;
}

/** API 와 worker 가 같은 환경 변수로 같은 결과 폴더와 서명 키를 연다. 서명 키가 없으면 시작하지 않는다. */
export function openLocalResults(env: NodeJS.ProcessEnv, port: number): LocalResults {
  const secret = env.NUNO_FILE_URL_SECRET;
  if (!secret) {
    throw new Error("NUNO_FILE_URL_SECRET 이 없다. 결과 사진 서명 주소 키를 환경 변수로 넣는다");
  }
  const store = createLocalResultStore({
    dir: env.NUNO_RESULT_DIR ?? DEFAULT_RESULT_DIR,
    secret,
    publicUrl: env.NUNO_PUBLIC_API_URL ?? `http://localhost:${port}`,
  });
  return { store, secret };
}

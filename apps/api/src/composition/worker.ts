import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createFakeImageCheck } from "../adapters/fake-image-check.ts";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import { createLogPushSender } from "../adapters/log-push.ts";
import { openPostgres } from "../adapters/postgres.ts";
import {
  devProviderMode,
  runNextJob,
  sweepJobs,
  type ClaimedJob,
  type ProviderChoice,
  type WorkerDeps,
} from "../generation/worker.ts";
import { openLocalResults } from "./local-results.ts";

// 작업 worker 시작점. API 서버와 따로 돌고, 같은 DATABASE_URL(nuno_api)과 결과 폴더와 서명 키를 쓴다.
// 공급사 호출 중에 내려가도 묶인 골드는 다음 예약 작업이 선점 기한을 보고 푼다.
const env = process.env;
const url = env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 이 없다. nuno_api 접속 주소를 환경 변수로 넣는다");
const port = Number(env.PORT ?? 8787);

const CLAIM_INTERVAL_MS = 1000;
const SWEEP_INTERVAL_MS = 60_000;
/** 한 worker 가 함께 돌리는 작업 수. 가짜 공급사 줄의 max_concurrency 와 같게 둔다. */
const MAX_ACTIVE_JOBS = 4;

const IMAGE_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const fakeImagePath = env.NUNO_FAKE_RESULT_IMAGE;
const fakeImage = fakeImagePath
  ? {
      image: new Uint8Array(await readFile(fakeImagePath)),
      mimeType: IMAGE_TYPES[extname(fakeImagePath).toLowerCase()] ?? "image/jpeg",
    }
  : {};

const db = openPostgres(url);
const devRoutes = env.NUNO_DEV_ROUTES === "1";

// 실제 공급사 어댑터는 키와 입력 올리기가 갖춰지면 더한다. 그때까지는 가짜 공급사다.
// 모델은 작업을 받은 공급사 설정 줄의 값을 시도 줄에 적는다.
async function chooseProvider(job: ClaimedJob): Promise<ProviderChoice> {
  const mode = devRoutes
    ? await devProviderMode(db, job.userId)
    : { mode: "succeed" as const, delayMs: 0, failCheckOnce: false };
  return {
    provider: createFakeProvider(mode.mode, 0.04, { delayMs: mode.delayMs, ...fakeImage }),
    model: job.providerConfig?.model ?? "fake",
    failCheckOnce: mode.failCheckOnce,
  };
}

const deps: WorkerDeps = {
  db,
  store: openLocalResults(env, port).store,
  check: createFakeImageCheck(),
  push: createLogPushSender(),
  now: () => new Date(),
  chooseProvider,
};

let active = 0;
const claimTimer = setInterval(() => {
  if (active >= MAX_ACTIVE_JOBS) return;
  active += 1;
  runNextJob(deps)
    .then((done) => {
      if (done) console.log(`작업 ${done.jobId}: ${done.outcome}`);
    })
    .catch((error: unknown) => console.error("작업 선점 실패", error))
    .finally(() => {
      active -= 1;
    });
}, CLAIM_INTERVAL_MS);

const sweep = () =>
  sweepJobs(deps)
    .then((count) => {
      if (count > 0)
        console.log(`예약 작업: 선점 기한이 지난 작업 ${count}건을 실패와 풀기로 정리했다`);
    })
    .catch((error: unknown) => console.error("예약 작업 실패", error));
void sweep();
const sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);

function stop() {
  clearInterval(claimTimer);
  clearInterval(sweepTimer);
  void db.close().finally(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`worker: ${CLAIM_INTERVAL_MS}ms 마다 선점, ${SWEEP_INTERVAL_MS}ms 마다 예약 작업`);
if (devRoutes) console.log("개발 전용 가짜 공급사 모드를 사용자별로 읽는다(NUNO_DEV_ROUTES=1)");

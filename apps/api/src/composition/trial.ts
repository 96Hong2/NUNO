// 반증 실험 명령. 키가 생기기 전에는 가짜 공급사로만 돈다.
//   node src/composition/trial.ts run <요청 목록.json> <호출 장부.csv> <채점 폴더> --provider fake
//   node src/composition/trial.ts check <채점 폴더>              (D5: 블라인드 검사)
//   node src/composition/trial.ts report <호출 장부.csv> <채점 폴더> [세트]
// 호출 장부 하나를 실험 전체가 함께 쓴다(모델별 상한을 이 장부로 센다). 채점 폴더 밖에 둔다.
import { randomUUID } from "node:crypto";
import {
  appendFile,
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import { checkScoringFolder } from "../trial/check-scoring.ts";
import { parseCsv } from "../trial/csv.ts";
import { buildReport, formatReport, MIN_AGREEMENT, outsideAgreement } from "../trial/report.ts";
import { runTrial, type TrialIo, type TrialRequest } from "../trial/run-trial.ts";

/** 채점 그림의 파일 시각. 모두 같게 맞춰 시각으로 모델 차례가 드러나지 않게 한다 */
const FIXED_TIME = new Date("2026-01-01T00:00:00Z");

const readText = (path: string) => readFile(path, "utf8").catch(() => null);

const io: TrialIo = {
  readFile: async (path) => new Uint8Array(await readFile(path)),
  readText,
  writeFile: async (path, bytes) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await utimes(path, FIXED_TIME, FIXED_TIME);
  },
  moveFile: async (from, to) => {
    await mkdir(dirname(to), { recursive: true });
    try {
      // rename 대신 새로 복사한다. inode 가 섞인 차례로 새로 생겨 호출 차례가 드러나지 않는다.
      await copyFile(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    await utimes(to, FIXED_TIME, FIXED_TIME);
    await rm(from);
    return true;
  },
  exists: (path) =>
    stat(path).then(
      () => true,
      () => false,
    ),
  writeText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  },
  appendText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, text);
  },
  lock: async (path) => {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(path, "wx").catch(() => {
      throw new Error(
        `다른 실행이 장부를 쓰는 중이다(잠금 파일 ${path}). 그 실행이 끝났으면 잠금 파일을 지운다`,
      );
    });
    await handle.close();
    return () => rm(path);
  },
  randomName: randomUUID,
  random: Math.random,
  now: Date.now,
};

const [command, ...args] = process.argv.slice(2);
const usage = (text: string): never => {
  console.error(`쓰는 법: ${text}`);
  process.exit(1);
};

if (command === "run") {
  const [planPath, ledgerPath, scoringDir] = args;
  const providerFlag = args[args.indexOf("--provider") + 1];
  if (!planPath || !ledgerPath || !scoringDir || providerFlag !== "fake") {
    usage(
      "run <요청 목록.json> <호출 장부.csv> <채점 폴더> --provider fake (진짜 공급사는 키가 생긴 날 더한다)",
    );
  }
  const requests = JSON.parse(await readFile(planPath as string, "utf8")) as TrialRequest[];
  const fake = createFakeProvider("succeed");
  // 첫 Ctrl-C 는 지금 호출을 마치고 끝낸다(그림 옮기기와 잠금 풀기를 돈다). 두 번째는 바로 끝낸다.
  let stopRequested = false;
  process.on("SIGINT", () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.error(
      "멈춤 요청: 지금 호출을 마치고 그림을 채점 폴더로 옮긴 뒤 끝낸다. 바로 끝내려면 한 번 더 누른다",
    );
  });
  const result = await runTrial(
    requests,
    { seedream: fake, sunburst: fake, flare: fake },
    {
      ledgerPath: ledgerPath as string,
      scoringDir: scoringDir as string,
      shouldStop: () => stopRequested,
    },
    io,
  );
  console.log(`이번에 ${result.called}건을 불렀고, 이미 부른 ${result.skipped}건은 건너뛰었다`);
  if (result.interrupted.length > 0) {
    console.error(
      `결과 없이 끊긴 호출 ${result.interrupted.length}건(다시 부르지 않음, 콘솔 청구액 확인): ${result.interrupted.join(", ")}`,
    );
  }
  if (result.missing.length > 0) {
    console.error(
      `장부에는 성공인데 그림을 찾지 못했다 ${result.missing.length}건: ${result.missing.join(", ")}`,
    );
    process.exitCode = 1;
  }
  if (result.stopped) {
    console.error("멈춤 요청으로 끝냈다. 같은 명령을 다시 돌리면 남은 요청을 이어 부른다");
    process.exit(130);
  }
  const capped = Object.entries(result.capped);
  if (capped.length > 0) {
    console.error(
      `멈춤: 호출 상한에 닿아 부르지 않은 요청 ${capped.map(([model, n]) => `${model} ${n}건`).join(", ")}`,
    );
    process.exit(2);
  }
} else if (command === "check") {
  const [scoringDir] = args;
  if (!scoringDir) usage("check <채점 폴더>");
  const names = await readdir(scoringDir as string);
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(join(scoringDir as string, name))),
    })),
  );
  const problems = checkScoringFolder(
    files,
    (await readText(join(scoringDir as string, "scoring.csv"))) ?? "",
  );
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(
    `문제 없음: 그림 ${files.filter((file) => /\.(jpg|png)$/.test(file.name)).length}장, 이름은 무작위, 메타데이터 없음, 채점 CSV 에 모델 열 없음`,
  );
} else if (command === "report") {
  const [ledgerPath, scoringDir, set = "select"] = args;
  if (!ledgerPath || !scoringDir)
    usage("report <호출 장부.csv> <채점 폴더> [select|confirm|explore|block]");
  const calls = parseCsv((await readText(ledgerPath as string)) ?? "");
  const scoring = parseCsv((await readText(join(scoringDir as string, "scoring.csv"))) ?? "");
  console.log(formatReport(buildReport(calls, scoring, set), set));
  const { sample, agree } = outsideAgreement(scoring);
  if (sample > 0) {
    console.log(
      `바깥 평가 ${sample}장: 기획자와 같은 장 ${agree[0]}, ${agree[1]}(${MIN_AGREEMENT}장보다 적으면 채점표를 고쳐 다시 채점)`,
    );
  }
} else {
  usage("run, check, report 가운데 하나");
}

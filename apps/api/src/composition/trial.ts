// 반증 실험 명령. 키가 생기기 전에는 가짜 공급사로만 돈다.
//   node src/composition/trial.ts run <요청 목록.json> <호출 장부.csv> <채점 폴더> --provider fake
//   node src/composition/trial.ts check <채점 폴더>              (D5: 블라인드 검사)
//   node src/composition/trial.ts report <호출 장부.csv> <채점 폴더> [세트]
// 호출 장부 하나를 실험 전체가 함께 쓴다(모델별 상한을 이 장부로 센다). 채점 폴더 밖에 둔다.
import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
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
  const result = await runTrial(
    requests,
    { seedream: fake, sunburst: fake, flare: fake },
    { ledgerPath: ledgerPath as string, scoringDir: scoringDir as string },
    io,
  );
  console.log(`이번에 ${result.called}건을 불렀고, 이미 부른 ${result.skipped}건은 건너뛰었다`);
  if (result.interrupted.length > 0) {
    console.error(
      `결과 없이 끊긴 호출 ${result.interrupted.length}건(다시 부르지 않음): ${result.interrupted.join(", ")}`,
    );
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
    `문제 없음: 그림 ${files.length - 1}장, 이름은 무작위, 메타데이터 없음, 채점 CSV 에 모델 열 없음`,
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

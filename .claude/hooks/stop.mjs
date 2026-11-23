// Stop: 작업 트리가 바뀌었으면 pnpm verify:fast 를 돌리고, 실패하면 decision block 으로 턴을 이어 가게 한다.
// 이미 한 번 막았는지는 보지 않는다. 고칠 때까지 막고, 연속 차단 상한이 고리를 끊는다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gitTopLevel, readHookInput, runGit } from "./hook-input.mjs";

const VERIFY_TIMEOUT_MS = 170_000;
const MAX_LINES = 20;
const OK_FILE = "nuno-verify-ok";
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

// git status -z 출력에서 바뀐 경로와 추적하지 않는 파일을 꺼낸다. 이름 바꾸기는 옛 이름도 넣는다.
function parseStatus(text) {
  const entries = text.split("\0");
  const paths = [];
  const untracked = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    paths.push(path);
    if (code === "??") untracked.push(path);
    if (code.includes("R") || code.includes("C")) {
      i += 1;
      if (entries[i]) paths.push(entries[i]);
    }
  }
  return { paths, untracked };
}

function isDocsOnly(path) {
  return path.startsWith("docs/") || path.toLowerCase().endsWith(".md");
}

function failedStep(output, root) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
  } catch {
    // 단계 이름을 못 찾으면 명령 줄을 그대로 쓴다.
  }
  const lines = output.split("\n");
  let start = 0;
  let step = "알 수 없는 단계";
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("$ ")) continue;
    const command = line.slice(2).trim();
    if (command === scripts["verify:fast"]) continue;
    const name = Object.keys(scripts).find((key) => scripts[key] === command);
    step = name ? `pnpm ${name}` : command;
    start = index + 1;
  }
  const errors = lines
    .slice(start)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !/ELIFECYCLE|ERR_PNPM_RECURSIVE_RUN/.test(line))
    .slice(0, MAX_LINES);
  return { step, errors };
}

function main() {
  const { input } = readHookInput();
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const root = gitTopLevel(cwd);
  if (root === null) return;

  const status = runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0)
    block(`git status 가 실패했다: ${status.stderr.trim()}. 저장소 상태를 확인한다.`);
  const { paths, untracked } = parseStatus(status.stdout);
  if (paths.length === 0 || paths.every(isDocsOnly)) return;

  const head = runGit(root, ["rev-parse", "--verify", "-q", "HEAD"]).stdout.trim();
  const diff = runGit(root, ["diff", "HEAD", "--binary", "--no-ext-diff", "--no-color"]);
  const hash = createHash("sha256");
  hash.update(`${head}\0${status.stdout}\0${diff.stdout}\0`);
  // 추적하지 않는 파일은 diff 에 안 나오므로 내용을 따로 넣는다.
  for (const path of untracked.sort()) {
    const absolute = join(root, path);
    hash.update(`${path}\0`);
    if (existsSync(absolute) && statSync(absolute).isFile()) hash.update(readFileSync(absolute));
  }
  const digest = hash.digest("hex");

  const gitPath = runGit(root, ["rev-parse", "--git-path", OK_FILE]).stdout.trim();
  const okFile = resolve(root, gitPath || join(".git", OK_FILE));
  if (existsSync(okFile) && readFileSync(okFile, "utf8").trim() === digest) return;

  // 단계 머리줄과 오류 순서를 지키려고 stderr 를 stdout 에 합친다.
  const result = spawnSync("sh", ["-c", "pnpm verify:fast 2>&1"], {
    cwd: root,
    encoding: "utf8",
    timeout: VERIFY_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });

  if (result.status === 127) {
    block(
      "pnpm 을 찾지 못해 verify:fast 를 돌리지 못했다. pnpm 을 설치하거나 PATH 를 확인한 뒤 끝낸다.",
    );
  }
  if (result.error || result.signal) {
    block(
      `verify:fast 가 ${VERIFY_TIMEOUT_MS / 1000}초 안에 끝나지 않았다. 느린 단계를 찾아 고친 뒤 끝낸다.`,
    );
  }
  if (result.status !== 0) {
    const output = result.stdout.replace(ANSI_COLOR, "").replaceAll(`${root}/`, "");
    const { step, errors } = failedStep(output, root);
    block(`verify:fast 실패: ${step} 단계.\n${errors.join("\n")}\n고친 뒤 끝낸다.`);
  }

  mkdirSync(dirname(okFile), { recursive: true });
  writeFileSync(okFile, `${digest}\n`);
}

main();

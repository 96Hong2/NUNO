// Stop: 코드가 바뀌었으면 pnpm verify:fast 를 돌리고, 실패하면 decision block 으로 턴을 이어 가게 한다.
// 이미 한 번 막았는지는 보지 않는다. 고칠 때까지 막고, 연속 차단 상한이 고리를 끊는다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gitTopLevel, readHookInput, runGit } from "./hook-input.mjs";

// verify:fast 통과 해시를 적는 파일. 자리는 git rev-parse --git-path 로 찾는다(worktree 마다 따로).
const VERIFY_OK_FILE = "nuno-verify-ok";

const TIMEOUT_MS = 170_000;

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

const list = (result) => (result.status === 0 ? result.stdout.split("\0").filter(Boolean) : []);

// .claude/ 아래와 AGENTS.md, CLAUDE.md 는 check:rules 가 보므로 문서로 치지 않는다.
function isDocsOnly(path) {
  if (path.startsWith(".claude/") || /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/.test(path)) return false;
  return path.startsWith("docs/") || path.toLowerCase().endsWith(".md");
}

function main() {
  const input = readHookInput();
  const root = gitTopLevel(typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd());
  if (root === null) return;

  // 작업 트리 변경, 추적하지 않는 파일, 커밋했지만 origin/main 에 없는 변경.
  // --no-renames 로 이름을 바꾼 파일의 옛 경로도 넣는다. 코드를 docs 로 옮겨도 검사가 돈다.
  const untracked = list(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  const base = runGit(root, ["merge-base", "HEAD", "origin/main"]).stdout.trim();
  const changed = (...range) =>
    list(runGit(root, ["diff", "--name-only", "--no-renames", "-z", ...range]));
  const paths = [...changed("HEAD"), ...untracked, ...(base ? changed(base, "HEAD") : [])];
  if (paths.every(isDocsOnly)) return;

  // 같은 상태로 이미 통과했으면 다시 돌리지 않는다.
  const hash = createHash("sha256");
  hash.update(runGit(root, ["rev-parse", "HEAD"]).stdout);
  hash.update(runGit(root, ["diff", "HEAD", "--binary", "--no-ext-diff", "--no-color"]).stdout);
  for (const path of untracked.sort()) {
    const absolute = join(root, path);
    hash.update(`\0${path}\0`);
    if (existsSync(absolute) && statSync(absolute).isFile()) hash.update(readFileSync(absolute));
  }
  const digest = hash.digest("hex");
  const okFile = resolve(
    root,
    runGit(root, ["rev-parse", "--git-path", VERIFY_OK_FILE]).stdout.trim(),
  );
  if (existsSync(okFile) && readFileSync(okFile, "utf8").trim() === digest) return;

  const result = spawnSync("sh", ["-c", "pnpm verify:fast 2>&1"], {
    cwd: root,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  if (result.status === 127) {
    // Claude 가 고칠 수 없는 환경 문제라 막지 않고 알리기만 한다.
    const message =
      "PATH 에서 pnpm 이나 node 를 찾지 못해 verify:fast 를 돌리지 못했다. 사람에게 알린다.";
    process.stdout.write(JSON.stringify({ systemMessage: message }));
    return;
  }
  if (result.error || result.signal) {
    block(
      `verify:fast 가 ${TIMEOUT_MS / 1000}초 안에 끝나지 않았다. 느린 단계를 찾아 고친 뒤 끝낸다.`,
    );
  }
  if (result.status !== 0) {
    // 실패한 단계의 머리줄(맨 마지막 "$ " 줄)과 그 뒤 20줄. vitest 는 실패 시험 이름과 단언 줄이
    // 앞의 × 목록 뒤에 나오므로 「Failed Tests」 나 첫 FAIL 줄부터 보인다.
    const lines = result.stdout.replaceAll(`${root}/`, "").replaceAll(root, ".").split("\n");
    const head = Math.max(
      lines.findLastIndex((line) => line.startsWith("$ ")),
      0,
    );
    const fail = lines.findIndex((line, k) => k > head && /Failed Tests \d|^\s*FAIL\s/.test(line));
    const shown = [lines[head], ...lines.slice(fail === -1 ? head + 1 : fail)]
      .filter((line) => line?.trim() && !/ELIFECYCLE|ERR_PNPM/.test(line))
      .slice(0, 21);
    block(`verify:fast 실패:\n${shown.join("\n")}\n고친 뒤 끝낸다.`);
  }
  mkdirSync(dirname(okFile), { recursive: true });
  writeFileSync(okFile, `${digest}\n`);
}

main();

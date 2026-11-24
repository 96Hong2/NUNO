// PostToolUse: 방금 고친 파일 하나만 prettier 로 맞추고 eslint 로 본다.
// 문제가 있으면 decision block 으로 Claude 에게 알린다. 편집은 이미 끝난 뒤다.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { commonGitDir, gitTopLevel, readHookInput } from "./hook-input.mjs";

const FORMAT = /^\.(?:[cm]?[jt]sx?|json|ya?ml|css)$/;
const LINT = /^\.[cm]?[jt]sx?$/;

function report(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

function run(bin, args, root) {
  const result = spawnSync(join(root, "node_modules", ".bin", bin), args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return result.status === 0 ? null : output.split("\n").slice(0, 20).join("\n");
}

function main() {
  const input = readHookInput();
  const rawPath = input?.tool_input?.file_path;
  if (typeof rawPath !== "string" || rawPath === "") return;
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const filePath = resolve(cwd, rawPath);
  const extension = extname(filePath).toLowerCase();
  if (!FORMAT.test(extension) || !existsSync(filePath)) return;

  // 이 세션 저장소(그 worktree 포함)의 파일만 본다. 다른 저장소는 그쪽 설정을 모르니 손대지 않는다.
  // 세션 폴더(cwd)가 저장소 밖이어도 프로젝트 폴더(CLAUDE_PROJECT_DIR)의 저장소면 본다.
  const root = gitTopLevel(dirname(filePath));
  if (root === null) return;
  const sessionDirs = [cwd, process.env.CLAUDE_PROJECT_DIR].filter((dir) => dir);
  const sessionRepos = sessionDirs
    .map(gitTopLevel)
    .filter((top) => top !== null)
    .map(commonGitDir);
  if (!sessionRepos.includes(commonGitDir(root))) return;
  const rel = relative(root, filePath);
  if (rel.split("/").includes("node_modules")) return;
  if (!["prettier", "eslint"].every((bin) => existsSync(join(root, "node_modules", ".bin", bin)))) {
    report(
      "node_modules 에 prettier 나 eslint 가 없어 고친 파일을 보지 못했다. pnpm install 을 돌린다.",
    );
  }

  const problems = [];
  const formatted = run(
    "prettier",
    ["--write", "--ignore-unknown", "--log-level", "warn", rel],
    root,
  );
  if (formatted !== null) problems.push(`prettier 가 ${rel} 을 맞추지 못했다:\n${formatted}`);
  if (LINT.test(extension)) {
    const cache = ["--cache", "--cache-location", "node_modules/.cache/eslint-post/"];
    // pnpm lint 처럼 경고도 실패로 본다. 경고만 있어도 Stop 의 verify:fast 가 막는다.
    const linted = run("eslint", [...cache, "--no-warn-ignored", "--max-warnings", "0", rel], root);
    if (linted !== null) problems.push(`eslint 가 ${rel} 에서 문제를 찾았다:\n${linted}`);
  }
  if (problems.length > 0) {
    report(`${problems.join("\n")}\n이 파일을 고친다. 끝났다는 판정은 pnpm verify:fast 로 한다.`);
  }
}

main();

// PostToolUse: 방금 고친 파일 하나만 prettier 로 맞추고 eslint 로 본다.
// 린트 오류가 있으면 decision block 으로 Claude 에게 오류 줄을 알린다. 편집은 이미 끝난 뒤다.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { gitTopLevel, readHookInput } from "./hook-input.mjs";

const PRETTIER_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".css",
]);
const ESLINT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const MAX_LINES = 20;

function report(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

function run(bin, args, cwd) {
  return spawnSync(bin, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function eslintProblems(stdout, root) {
  let results;
  try {
    results = JSON.parse(stdout);
  } catch {
    return null;
  }
  const lines = [];
  for (const result of results) {
    const file = relative(root, result.filePath).split(sep).join("/");
    for (const message of result.messages) {
      const level = message.severity === 2 ? "오류" : "경고";
      const rule = message.ruleId ? ` (${message.ruleId})` : "";
      lines.push(
        `${file}:${message.line ?? 0}:${message.column ?? 0} ${level} ${message.message}${rule}`,
      );
    }
  }
  return lines;
}

function main() {
  const { input } = readHookInput();
  if (input === null) return;
  const rawPath = input.tool_input?.file_path;
  if (typeof rawPath !== "string" || rawPath === "") return;

  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const filePath = resolve(cwd, rawPath);
  const extension = extname(filePath).toLowerCase();
  if (!PRETTIER_EXTENSIONS.has(extension)) return;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return;

  const root = gitTopLevel(dirname(filePath));
  if (root === null) return;
  // 이 세션의 저장소 파일만 본다. 다른 저장소는 그쪽 설정과 의존성을 모르니 손대지 않는다.
  const sessionRoots = [cwd, process.env.CLAUDE_PROJECT_DIR]
    .filter((dir) => typeof dir === "string" && dir !== "")
    .map((dir) => gitTopLevel(dir));
  if (!sessionRoots.includes(root)) return;
  const rel = relative(root, filePath);
  if (rel.startsWith(`..${sep}`) || isAbsolute(rel) || rel.split(sep).includes("node_modules"))
    return;

  const bin = join(root, "node_modules", ".bin");
  const prettier = join(bin, "prettier");
  const eslint = join(bin, "eslint");
  if (!existsSync(prettier) || !existsSync(eslint)) {
    report(
      "node_modules 에 prettier 나 eslint 가 없어 고친 파일을 검사하지 못했다. pnpm install 을 돌린다.",
    );
  }

  const problems = [];

  // .prettierignore 와 .gitignore 를 따른다. 무시한 파일은 아무것도 하지 않는다.
  const formatted = run(
    prettier,
    ["--write", "--ignore-unknown", "--log-level", "warn", rel],
    root,
  );
  if (formatted.status !== 0) {
    const output = `${formatted.stderr}${formatted.stdout}`.trim().split("\n").slice(0, MAX_LINES);
    problems.push(`prettier 가 ${rel} 을 맞추지 못했다:`, ...output);
  }

  if (ESLINT_EXTENSIONS.has(extension)) {
    const cache = join("node_modules", ".cache", "eslint-post") + sep;
    const linted = run(
      eslint,
      ["--cache", "--cache-location", cache, "--no-warn-ignored", "--format", "json", rel],
      root,
    );
    const lines = eslintProblems(linted.stdout, root);
    if (lines === null) {
      if (linted.status !== 0) {
        const output = `${linted.stderr}${linted.stdout}`.trim().split("\n").slice(0, MAX_LINES);
        problems.push(`eslint 가 ${rel} 을 검사하지 못했다:`, ...output);
      }
    } else if (lines.length > 0) {
      problems.push(
        `eslint 가 ${rel} 에서 ${lines.length}건을 찾았다:`,
        ...lines.slice(0, MAX_LINES),
      );
    }
  }

  if (problems.length > 0) {
    report(`${problems.join("\n")}\n이 파일을 고친다. 끝났다는 판정은 pnpm verify:fast 로 한다.`);
  }
}

main();

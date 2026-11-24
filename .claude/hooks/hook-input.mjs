// 세 훅이 함께 쓰는 입력 읽기와 git 위치 찾기.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

// stdin 의 JSON 객체. 읽지 못하거나 객체가 아니면 null 이다.
export function readHookInput() {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    return input !== null && typeof input === "object" && !Array.isArray(input) ? input : null;
  } catch {
    return null;
  }
}

export function runGit(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

// 실제 경로. 아직 없는 경로는 있는 상위 폴더까지만 풀고 나머지를 붙인다.
export function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : resolve(realPath(parent), path.slice(parent.length + 1));
  }
}

// 주어진 경로(없으면 있는 상위 폴더)의 git 최상위. worktree 에서는 그 worktree 를 낸다.
export function gitTopLevel(path) {
  let dir = path;
  while (dir && !existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  if (!dir) return null;
  const result = runGit(dir, ["rev-parse", "--show-toplevel"]);
  return result.status === 0 ? result.stdout.trim() : null;
}

// 같은 저장소의 worktree 들이 함께 쓰는 .git 폴더. 두 경로가 같은 저장소인지 볼 때 쓴다.
export function commonGitDir(top) {
  const result = runGit(top, ["rev-parse", "--git-common-dir"]);
  return result.status === 0 ? realPath(resolve(top, result.stdout.trim())) : null;
}

// 그 저장소의 모든 worktree 최상위(실제 경로).
export function worktreeRoots(top) {
  const listed = runGit(top, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return [realPath(top)];
  return listed.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realPath(line.slice("worktree ".length)));
}

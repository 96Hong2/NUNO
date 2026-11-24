// 세 훅이 함께 쓰는 입력 읽기와 git 위치 찾기.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

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

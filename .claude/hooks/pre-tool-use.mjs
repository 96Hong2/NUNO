// PreToolUse: 훅과 CI 설정 고치기, main 에 있는 시험 고치기, --no-verify 를 막는다.
// 판정은 policy.mjs 가 하고, 여기서는 입력을 읽어 저장소 경로와 main 시험 목록을 넘긴다.
import { realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { gitTopLevel, readHookInput, runGit } from "./hook-input.mjs";
import { REASON, commandReason, pathReason } from "./policy.mjs";

function deny(reason) {
  const decision = { permissionDecision: "deny", permissionDecisionReason: reason };
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }),
  );
  process.exit(0);
}

// origin/main 의 시험 경로. origin/main 이 없거나 저장소 밖이면 빈 Set 이다.
function mainTests(root) {
  if (root === null) return new Set();
  const listed = runGit(root, ["ls-tree", "-r", "-z", "--name-only", "origin/main"]);
  return new Set(listed.status === 0 ? listed.stdout.split("\0").filter(Boolean) : []);
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function main() {
  const input = readHookInput();
  if (input === null) deny(REASON.badInput);
  const toolInput = input.tool_input ?? {};
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();

  if (input.tool_name === "Bash") {
    if (typeof toolInput.command !== "string") deny(REASON.badInput);
    // 명령 속 상대 경로는 저장소 기준 cwd 에서 풀어 판정한다. 저장소 밖이면 cwd 는 null.
    const top = gitTopLevel(cwd);
    const root = top === null ? null : realPath(top);
    const rel = root === null ? "" : relative(root, realPath(cwd)).split(sep).join("/");
    const inside = root !== null && rel !== ".." && !rel.startsWith("../");
    const context = { cwd: inside ? rel : null, root, mainTests: mainTests(top) };
    const reason = commandReason(toolInput.command, context);
    if (reason) deny(reason);
    return;
  }

  const rawPath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof rawPath !== "string" || rawPath === "") deny(REASON.badInput);
  // 새 파일은 아직 없으니 폴더만 실제 경로로 바꾼다.
  const absolute = resolve(cwd, rawPath);
  const filePath = join(realPath(dirname(absolute)), basename(absolute));
  const root = gitTopLevel(dirname(filePath));
  if (root === null) return;
  const rel = relative(realPath(root), filePath).split(sep).join("/");
  const reason = pathReason(rel, mainTests(root));
  if (reason) deny(reason);
}

try {
  main();
} catch (error) {
  deny(`${REASON.badInput} (${error instanceof Error ? error.message : String(error)})`);
}

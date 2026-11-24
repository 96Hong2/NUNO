// PreToolUse: 훅과 CI 설정 고치기, main 에 있는 시험 고치기, --no-verify 를 막는다.
// 판정은 policy.mjs 가 하고, 여기서는 입력을 읽어 저장소 경로와 main 시험 목록을 넘긴다.
import { dirname, relative, resolve, sep } from "node:path";
import { gitTopLevel, readHookInput, realPath, runGit, worktreeRoots } from "./hook-input.mjs";
import { REASON, commandReason, pathReason } from "./policy.mjs";

function deny(reason) {
  const decision = { permissionDecision: "deny", permissionDecisionReason: reason };
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }),
  );
  process.exit(0);
}

// origin/main 의 시험 경로. origin/main 이 없거나 저장소 밖이면 빈 Set 이다.
function mainTests(top) {
  if (top === null) return new Set();
  const listed = runGit(top, ["ls-tree", "-r", "-z", "--name-only", "origin/main"]);
  return new Set(listed.status === 0 ? listed.stdout.split("\0").filter(Boolean) : []);
}

function main() {
  const input = readHookInput();
  if (input === null) deny(REASON.badInput);
  const toolInput = input.tool_input ?? {};
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();

  if (input.tool_name === "Bash") {
    if (typeof toolInput.command !== "string") deny(REASON.badInput);
    // 세션 폴더가 저장소 밖이어도 프로젝트 폴더의 저장소를 지킨다. 그 저장소의 worktree 를 모두 본다.
    const top = gitTopLevel(cwd) ?? gitTopLevel(process.env.CLAUDE_PROJECT_DIR ?? "");
    const roots = top === null ? [] : worktreeRoots(top);
    const context = { cwd: realPath(cwd), roots, mainTests: mainTests(top) };
    const reason = commandReason(toolInput.command, context);
    if (reason) deny(reason);
    return;
  }

  const rawPath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof rawPath !== "string" || rawPath === "") deny(REASON.badInput);
  const filePath = realPath(resolve(cwd, rawPath));
  const top = gitTopLevel(dirname(filePath));
  if (top === null) return;
  const rel = relative(realPath(top), filePath).split(sep).join("/");
  const reason = pathReason(rel, mainTests(top));
  if (reason) deny(reason);
}

try {
  main();
} catch (error) {
  deny(`${REASON.badInput} (${error instanceof Error ? error.message : String(error)})`);
}

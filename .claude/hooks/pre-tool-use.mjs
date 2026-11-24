// PreToolUse: 판정은 policy.mjs 가 한다. 여기서는 입력을 읽어 저장소 경로와 main 시험 목록을 넘긴다.
import { dirname, relative, resolve, sep } from "node:path";
import { gitTopLevel, readHookInput, realPath, runGit } from "./hook-input.mjs";
import { REASON, commandReason, pathReason } from "./policy.mjs";

function deny(reason) {
  const decision = { permissionDecision: "deny", permissionDecisionReason: reason };
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }),
  );
  process.exit(0);
}

function main() {
  const input = readHookInput();
  if (input === null) deny(REASON.badInput);
  const toolInput = input.tool_input ?? {};

  if (input.tool_name === "Bash") {
    if (typeof toolInput.command !== "string") deny(REASON.badInput);
    const reason = commandReason(toolInput.command);
    if (reason) deny(reason);
    return;
  }

  const rawPath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof rawPath !== "string" || rawPath === "") deny(REASON.badInput);
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const filePath = realPath(resolve(cwd, rawPath));
  const top = gitTopLevel(dirname(filePath));
  if (top === null) return;
  const listed = runGit(top, ["ls-tree", "-r", "-z", "--name-only", "origin/main"]);
  const mainTests = new Set(listed.status === 0 ? listed.stdout.split("\0") : []);
  const reason = pathReason(relative(realPath(top), filePath).split(sep).join("/"), mainTests);
  if (reason) deny(reason);
}

try {
  main();
} catch (error) {
  deny(`${REASON.badInput} (${error instanceof Error ? error.message : String(error)})`);
}

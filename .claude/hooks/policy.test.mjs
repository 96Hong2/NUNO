import { describe, expect, it } from "vitest";
import { REASON, commandReason, pathReason } from "./policy.mjs";

const TEST = "packages/device-db/src/application/run-migrations.test.ts";
const mainTests = new Set([TEST]);

describe("pathReason: Edit 와 Write 로 고치는 파일", () => {
  it.each([
    [".github/workflows/verify.yml", ".github"],
    [".claude/hooks/stop.mjs", ".claude/hooks"],
    [".claude/settings.json", ".claude/settings.json"],
    [".claude/settings.local.json", ".claude/settings.local.json"],
  ])("%s 는 막는다", (rel, label) => {
    expect(pathReason(rel, mainTests)).toBe(REASON.protectedPath(label));
  });

  it("main 에 있는 시험은 막고, 새 시험과 다른 파일은 통과한다", () => {
    expect(pathReason(TEST, mainTests)).toBe(REASON.existingTest(TEST));
    expect(pathReason("packages/device-db/src/application/new.test.ts", mainTests)).toBeNull();
    expect(pathReason(".claude/rules/tests.md", mainTests)).toBeNull();
  });
});

describe("commandReason: Bash 명령", () => {
  it("git commit 과 push 의 --no-verify 를 막는다", () => {
    expect(commandReason("git commit --no-verify -m x")).toBe(REASON.noVerify);
    expect(commandReason("cd a && git push --no-verify")).toBe(REASON.noVerify);
  });

  it("커밋 메시지 속 글자는 막지 않는다", () => {
    expect(commandReason('git commit -m "--no-verify 를 막는다"')).toBeNull();
    expect(
      commandReason('git commit -m "$(cat <<\'EOF\'\n- "git commit --no-verify" 예시\nEOF\n)"'),
    ).toBeNull();
  });
});

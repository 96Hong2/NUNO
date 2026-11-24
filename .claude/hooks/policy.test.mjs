import { describe, expect, it } from "vitest";
import { REASON, commandReason, pathReason } from "./policy.mjs";

const TEST = "packages/device-db/src/application/run-migrations.test.ts";
const mainTests = new Set([TEST, "apps/mobile/app/index.tsx"]);

describe("pathReason: Edit 와 Write 로 고치는 파일", () => {
  it.each([
    [".github/workflows/verify.yml", ".github"],
    [".claude/hooks/pre-tool-use.mjs", ".claude/hooks"],
    [".claude/settings.json", ".claude/settings.json"],
    [".claude/settings.local.json", ".claude/settings.local.json"],
  ])("%s 는 보호 경로라 막는다", (rel, label) => {
    expect(pathReason(rel, mainTests)).toBe(REASON.protectedPath(label));
  });

  it("main 에 있는 시험은 막는다", () => {
    expect(pathReason(TEST, mainTests)).toBe(REASON.existingTest(TEST));
  });

  it.each([
    "packages/device-db/src/application/new-case.test.ts",
    "apps/mobile/app/index.tsx",
    ".claude/rules/tests.md",
    "docs/github.md",
  ])("%s 는 통과한다", (rel) => {
    expect(pathReason(rel, mainTests)).toBeNull();
  });
});

describe("commandReason: Bash 명령", () => {
  it.each([
    ["git commit --no-verify -m x", REASON.noVerify],
    ["git push --no-verify", REASON.noVerify],
    ["echo x > .github/workflows/verify.yml", REASON.protectedPath(".github")],
    ["cat a >> ./.claude/settings.json", REASON.protectedPath(".claude/settings.json")],
    ["rm -rf .claude/hooks", REASON.protectedPath(".claude/hooks")],
    ["rm -rf .claude", REASON.protectedPath(".claude")],
    ["cd x && sed -i '' s/a/b/ .github/x.yml", REASON.protectedPath(".github")],
    ["cp /tmp/a.mjs .claude/hooks/stop.mjs", REASON.protectedPath(".claude/hooks")],
    ["git mv .github .gh", REASON.protectedPath(".github")],
    ['bash -c "rm .claude/hooks/stop.mjs"', REASON.protectedPath(".claude/hooks")],
    [`sed -i '' s/1/2/ ${TEST}`, REASON.existingTest(TEST)],
    [
      "cd packages/device-db && tee src/application/run-migrations.test.ts",
      REASON.existingTest(TEST),
    ],
  ])("%s 는 막는다", (command, reason) => {
    expect(commandReason(command, mainTests)).toBe(reason);
  });

  it.each([
    `git restore ${TEST}`,
    `git checkout origin/main -- ${TEST}`,
    "cat .claude/hooks/pre-tool-use.mjs",
    "node -e \"require('fs').readFileSync('.claude/settings.json')\"",
    "cp .github/workflows/verify.yml /tmp/verify.yml",
    "grep -n verify .github/workflows/verify.yml 2>&1 | head",
    "cat > packages/device-db/src/application/new-case.test.ts <<'EOF'",
    "pnpm verify:fast > /tmp/out.txt 2>&1",
    "git commit -m 'no-verify 를 쓰지 않는다'",
  ])("%s 는 통과한다", (command) => {
    expect(commandReason(command, mainTests)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { REASON, commandReason, pathReason } from "./policy.mjs";

const TEST = "packages/device-db/src/application/run-migrations.test.ts";
const DOMAIN_TEST = "packages/device-db/src/domain/migration.test.ts";
const mainTests = new Set([TEST, DOMAIN_TEST, "apps/mobile/app/index.tsx"]);
const ROOT = "/repo";
const at = (cwd) => ({ cwd, root: ROOT, mainTests });
const hooks = REASON.protectedPath(".claude/hooks");
const github = REASON.protectedPath(".github");

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

describe("commandReason: 막아야 하는 Bash 명령", () => {
  it.each([
    ["git commit --no-verify -m x", "", REASON.noVerify],
    ["git push --no-verify", "", REASON.noVerify],
    ["git commit -nm x", "", REASON.noVerify],
    ["echo x > .github/workflows/verify.yml", "", github],
    ["cat a >> ./.claude/settings.json", "", REASON.protectedPath(".claude/settings.json")],
    ["pnpm verify:fast &> .github/out.txt", "", github],
    ["rm -rf .claude/hooks", "", hooks],
    ["rm -rf .claude", "", hooks],
    ["rm -rf .claude/*", "", hooks],
    ["rm .claude/settings*.json", "", REASON.protectedPath(".claude/settings.json")],
    ["sed -i '' s/a/b/ .github/x.yml", "", github],
    ["sed --in-place 's/a/b/' .github/workflows/verify.yml", "", github],
    ["cp /tmp/a.mjs .claude/hooks/stop.mjs", "", hooks],
    ["git mv .github .gh", "", github],
    ['bash -c "rm .claude/hooks/stop.mjs"', "", hooks],
    ["sudo rm -rf /repo/.github", "apps", github],
    ["pnpm prettier --write .github/workflows/verify.yml", "", github],
    [
      "node -e \"require('fs').writeFileSync('.claude/settings.json','{}')\"",
      "",
      REASON.protectedPath(".claude/settings.json"),
    ],
    ["cd .claude/hooks && sed -i '' 's/a/b/' policy.mjs", "", hooks],
    ["cd .claude && rm -rf hooks", "", hooks],
    ["sed -i '' s/a/b/ policy.mjs", ".claude/hooks", hooks],
    [`sed -i '' s/1/2/ ${TEST}`, "", REASON.existingTest(TEST)],
    [
      "cd packages/device-db && tee src/application/run-migrations.test.ts",
      "",
      REASON.existingTest(TEST),
    ],
    [
      "pnpm eslint --fix src/domain/migration.test.ts",
      "packages/device-db",
      REASON.existingTest(DOMAIN_TEST),
    ],
    ["rm packages/device-db/src/*/*.test.ts", "", REASON.existingTest(TEST)],
  ])("%s (cwd %j) 는 막는다", (command, cwd, reason) => {
    expect(commandReason(command, at(cwd))).toBe(reason);
  });
});

describe("commandReason: 통과해야 하는 Bash 명령", () => {
  it.each([
    [`git restore ${TEST}`, ""],
    [`git checkout origin/main -- ${TEST}`, ""],
    ["cat .claude/hooks/pre-tool-use.mjs", ""],
    ["sed -n '1,40p' .claude/hooks/policy.mjs", ""],
    ["node -e \"require('fs').readFileSync('.claude/settings.json')\"", ""],
    ["cp .github/workflows/verify.yml /tmp/verify.yml", ""],
    ["cp .claude/settings.json .claude/settings.json.bak", ""],
    ["grep -n verify .github/workflows/verify.yml 2>&1 | head", ""],
    ['rg -n "pnpm install" .github/workflows/verify.yml', ""],
    ['grep -rn "rm -rf" .claude/hooks', ""],
    ['git grep -n "sed -i" -- .claude/hooks', ""],
    ["grep -n touch .claude/hooks/policy.mjs", ""],
    ['git commit -m "hooks: rm 과 mv 판정에서 .claude/hooks 경로 정리"', ""],
    ['git commit -m "훅에서 --no-verify 를 막는다"', ""],
    ['git commit -m "a -> .github/workflows 정리"', ""],
    ["cat > docs/x.md <<'EOF'\n- rm .claude/hooks 를 막는다\n> .github/x\nEOF", ""],
    ["cat > packages/device-db/src/application/new-case.test.ts <<'EOF'", ""],
    ["touch src/domain/migration.test.ts", "packages/twin"],
    ["pnpm verify:fast > /tmp/out.txt 2>&1", ""],
    ["pnpm verify:fast 2>&1 | tee /tmp/log", ""],
    ["git push -n origin main", ""],
    ["rm -rf *", ""],
    ["rm -rf /tmp/other/.github", ""],
    ["echo x > .github/a", null],
  ])("%s (cwd %j) 는 통과한다", (command, cwd) => {
    expect(commandReason(command, at(cwd))).toBeNull();
  });
});

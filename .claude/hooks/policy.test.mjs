import { describe, expect, it } from "vitest";
import { REASON, commandReason, pathReason } from "./policy.mjs";

const TEST = "packages/device-db/src/application/run-migrations.test.ts";
const DOMAIN_TEST = "packages/device-db/src/domain/migration.test.ts";
const mainTests = new Set([TEST, DOMAIN_TEST, "apps/mobile/app/index.tsx"]);
// /repo 는 저장소, /repo/.claude/worktrees/wt 와 /wt2 는 같은 저장소의 다른 worktree 다.
const ROOTS = ["/repo", "/repo/.claude/worktrees/wt", "/wt2"];
const at = (cwd) => ({
  cwd: cwd === null ? null : `/repo${cwd ? `/${cwd}` : ""}`,
  roots: ROOTS,
  mainTests,
});
const settings = REASON.protectedPath(".claude/settings.json");
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
    // 다른 worktree 의 보호 경로
    ["rm /wt2/.claude/hooks/stop.mjs", "", hooks],
    ["cd /wt2 && rm .claude/hooks/stop.mjs", "", hooks],
    ["sed -i '' s/a/b/ /repo/.claude/worktrees/wt/.claude/hooks/policy.mjs", "", hooks],
    // 다른 판에서 가져와 덮어쓰기
    [`git checkout HEAD~3 -- ${TEST}`, "", REASON.existingTest(TEST)],
    ["git checkout feature/x -- .github/workflows/verify.yml", "", github],
    ["git restore --source=HEAD~1 .claude/hooks/policy.mjs", "", hooks],
    ["git restore -s t1/hooks .claude/hooks", "", hooks],
    // 인터프리터에 heredoc 으로 넘긴 쓰기 코드
    ["python3 - <<'EOF'\nopen('.claude/settings.json','w').write('{}')\nEOF", "", settings],
    ["node <<'EOF'\nrequire('fs').writeFileSync('.claude/hooks/stop.mjs','')\nEOF", "", hooks],
    // 폴더로 복사하면 원본 이름으로 생긴다
    ["cp /tmp/settings.json .claude/", "", settings],
    ["cp -r /tmp/hooks .claude/", "", hooks],
    ["rsync -a /tmp/hooks .claude/", "", hooks],
    [
      "cp /tmp/run-migrations.test.ts packages/device-db/src/application/",
      "",
      REASON.existingTest(TEST),
    ],
    // find 와 xargs
    ["find .claude/hooks -name '*.mjs' -exec sed -i '' 's/a/b/' {} +", "", hooks],
    ["find .github -name '*.yml' -delete", "", github],
    ["grep -l foo .claude/hooks/*.mjs | xargs sed -i '' 's/foo/bar/'", "", hooks],
    ["ls .claude/hooks/*.mjs | xargs rm", "", hooks],
    // pushd, \EOF heredoc 뒤 명령
    ["pushd .claude && rm -rf hooks && popd", "", hooks],
    ["cat > docs/x.md <<\\EOF\nbody\nEOF\nrm -rf .github", "", github],
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
    // 되돌리기와 브랜치 만들기
    ["git checkout main", ""],
    ["git checkout -b t2/profile origin/main", ""],
    [`git restore --staged ${TEST}`, ""],
    // 읽기만 하는 한 줄 코드와 heredoc
    ["python3 - <<'EOF'\nprint(open('.claude/settings.json').read())\nEOF", ""],
    [
      "python3 -c \"import sys; sys.stdout.write(open('.github/workflows/verify.yml').read())\"",
      "",
    ],
    [
      "node -e \"process.stdout.write(require('fs').readFileSync('.claude/settings.json','utf8'))\"",
      "",
    ],
    [
      "python3 -c \"import json;print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/r/.github/x.yml'}}))\"",
      "",
    ],
    [
      'node -e \'import("/tmp/nuno/.claude/hooks/policy.mjs").then(m=>console.log("Write rm", m.pathReason(".github", new Set())))\'',
      "",
    ],
    ["node -e \"console.log('a.github'.replace('a', 'b'))\"", ""],
    // Claude Code 기본 커밋 형식과 PR 본문
    [
      'git commit -m "$(cat <<\'EOF\'\n훅 판정 보강\n\n- "git commit -n -m x" 도 막는다\n- "grep -rn error logs" 예시\nEOF\n)"',
      "",
    ],
    [
      'gh pr create --title t --body "$(cat <<\'EOF\'\n- "echo x > .github/a" 를 막는다\nEOF\n)"',
      "",
    ],
    // 저장소 밖, find 와 xargs 의 넓은 대상
    ["pushd /tmp/other && rm -rf .github && popd", ""],
    ["find . -name '*.log' -delete", ""],
    ["find . -name '*.log' | xargs rm", ""],
    // 글롭이 아닌 [ 는 판정기를 깨지 않는다
    ["rm 'notes[draft.md'", ""],
    ["sed -i '' 's/foo\\[/bar/' docs/a.md", ""],
    ["perl -pi -e 's/\\[//g' docs/a.md", ""],
  ])("%s (cwd %j) 는 통과한다", (command, cwd) => {
    expect(commandReason(command, at(cwd))).toBeNull();
  });
});

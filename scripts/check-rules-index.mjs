#!/usr/bin/env node
// .claude/rules/*.md 가 AGENTS.md 「룰 색인」 표에 올라 있고, 머리에 paths: 가 있는지 본다.
// 색인에 없거나 paths 없는 룰은 아무도 모르게 로드되거나 아예 로드되지 않는다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rulesDir = join(root, ".claude", "rules");
const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

// 「## 룰 색인」 절의 표에서 `.claude/rules/<파일>.md` 를 모은다.
const section = agents.split(/^## /m).find((part) => part.startsWith("룰 색인"));
if (!section) {
  console.error("AGENTS.md 에 「## 룰 색인」 절이 없다.");
  process.exit(1);
}
const indexed = new Set(
  [...section.matchAll(/^\|\s*`\.claude\/rules\/([^`]+\.md)`/gm)].map((match) => match[1]),
);

const files = existsSync(rulesDir) ? readdirSync(rulesDir).filter((f) => f.endsWith(".md")) : [];
const problems = [];

for (const file of files) {
  if (!indexed.has(file)) {
    problems.push(`.claude/rules/${file}: AGENTS.md 룰 색인 표에 없다. 표에 한 줄 더한다.`);
  }
  const text = readFileSync(join(rulesDir, file), "utf8");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const hasPaths = front && /^paths:\s*\n(\s+- .+\n?)+/m.test(`${front[1]}\n`);
  if (!hasPaths) {
    problems.push(
      `.claude/rules/${file}: 머리에 paths: 목록이 없다. 파일 첫머리를 ---, paths:, 경로 목록, --- 차례로 쓴다.`,
    );
  }
}

for (const file of indexed) {
  if (!files.includes(file)) {
    problems.push(
      `.claude/rules/${file}: 룰 색인에는 있는데 파일이 없다. 색인 줄을 지우거나 파일을 만든다.`,
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`룰 색인 확인: ${files.length}개 모두 색인에 있고 paths: 가 있다.`);

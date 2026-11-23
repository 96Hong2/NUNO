#!/usr/bin/env node
// 워크스페이스 패키지 모양을 본다.
// 1. packages/*/src 아래에는 domain, application, testing 폴더와 index.ts 만 둔다.
// 2. 시험 파일은 각 패키지 src 아래에만 둔다. 밖에 두면 vitest 가 돌리지 않는다.
// 3. import 하는 @nuno/* 는 그 패키지 package.json dependencies 에 workspace:* 로 적는다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".expo", "web-build"]);
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const LAYER_ENTRY = /^(domain|application|testing)\/|^index\.ts$/;
const NUNO_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](@nuno\/[a-z0-9-]+)(?:\/[^"']*)?["']/g;

const toPosix = (path) => path.split(sep).join("/");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function workspaceDirs() {
  const dirs = [];
  for (const group of ["packages", "apps"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, "package.json"))) {
        dirs.push(join(base, entry.name));
      }
    }
  }
  return dirs;
}

const problems = [];

for (const dir of workspaceDirs()) {
  const where = toPosix(relative(root, dir));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const deps = pkg.dependencies ?? {};
  const files = walk(dir).map((file) => toPosix(relative(dir, file)));

  for (const file of files) {
    if (where.startsWith("packages/") && file.startsWith("src/")) {
      const inner = file.slice("src/".length);
      if (!LAYER_ENTRY.test(inner)) {
        problems.push(
          `${where}/${file}: src 아래 domain, application, testing, index.ts 밖에 있다. ` +
            "계층은 domain 과 application 둘뿐이다. 바깥 기능은 포트로 선언하고 apps/mobile/src/adapters 에서 구현한다.",
        );
      }
    }

    if (TEST_FILE.test(file) && !file.startsWith("src/")) {
      problems.push(
        `${where}/${file}: 시험 파일이 src 밖에 있어 vitest 가 돌리지 않는다. 시험하는 파일 옆 src 안으로 옮긴다.`,
      );
    }

    if (!SOURCE_FILE.test(file)) continue;
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(NUNO_IMPORT)) {
      const name = match[1];
      if (name === pkg.name) continue;
      if (deps[name] !== "workspace:*") {
        problems.push(
          `${where}/${file}: ${name} 을 import 하는데 ${where}/package.json dependencies 에 없다. ` +
            `"${name}": "workspace:*" 를 더하고 pnpm install 을 돈다.`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error([...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log("패키지 모양 확인: 계층 폴더, 시험 위치, @nuno 의존 선언이 모두 맞다.");

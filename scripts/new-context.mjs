#!/usr/bin/env node
// `pnpm new:context <이름>`: packages/<이름> 에 경계 컨텍스트 틀 다섯 파일을 만든다.
// 빈 폴더, .gitkeep, 시험 파일은 만들지 않는다. 빈 자리를 AI 가 채울 곳으로 읽기 때문이다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("사용법: pnpm new:context <이름>  (소문자, 숫자, - 만. 예: wardrobe)");
  process.exit(1);
}

const dir = join(root, "packages", name);
if (existsSync(dir)) {
  console.error(`packages/${name} 가 이미 있다. 다른 이름을 고르거나 그 패키지를 고친다.`);
  process.exit(1);
}

const files = {
  "package.json": `${JSON.stringify(
    {
      name: `@nuno/${name}`,
      version: "0.0.0",
      private: true,
      type: "module",
      sideEffects: false,
      exports: { ".": "./src/index.ts" },
    },
    null,
    2,
  )}\n`,
  "tsconfig.json": '{\n  "extends": "../../tsconfig.base.json",\n  "include": ["src"]\n}\n',
  "src/domain/index.ts": [
    `// ${name} 도메인: 순수 타입과 함수만 둔다. 시각과 ID 는 인자로 받는다.`,
    "export {};",
    "",
  ].join("\n"),
  "src/application/index.ts": [
    `// ${name} 유스케이스와 포트. 다른 컨텍스트가 필요하면 여기에 포트를 선언한다.`,
    "export {};",
    "",
  ].join("\n"),
  "src/index.ts": [
    `// @nuno/${name} 공개 면. 밖에서 쓰는 이름을 하나씩 적어 내보낸다(export * 금지).`,
    "export {};",
    "",
  ].join("\n"),
};

for (const [relative, content] of Object.entries(files)) {
  const target = join(dir, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`만듦 packages/${name}/${relative}`);
}

// 루트 tsconfig 가 프로젝트 참조를 쓰면 새 패키지를 더한다.
const rootTsconfigPath = join(root, "tsconfig.json");
const rootTsconfig = JSON.parse(readFileSync(rootTsconfigPath, "utf8"));
if (Array.isArray(rootTsconfig.references)) {
  const path = `./packages/${name}`;
  if (!rootTsconfig.references.some((ref) => ref.path === path)) {
    rootTsconfig.references.push({ path });
    writeFileSync(rootTsconfigPath, `${JSON.stringify(rootTsconfig, null, 2)}\n`);
    console.log(`더함 tsconfig.json references ${path}`);
  }
}

execFileSync("pnpm", ["install"], { cwd: root, stdio: "inherit" });
console.log(
  `\n다음: packages/${name}/src/domain 에 도메인을 쓰고 src/index.ts 에서 이름을 내보낸다.`,
);

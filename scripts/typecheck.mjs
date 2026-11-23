#!/usr/bin/env node
// 루트와 워크스페이스 tsconfig 마다 `tsc -p --incremental` 을 돈다.
// `tsc -b` 는 noEmit 프로젝트의 최신 여부를 자기 파일 시각으로만 판단해, 다른 패키지가 바뀐 것을 놓친다.
// incremental 은 프로그램에 든 모든 파일의 내용을 비교하므로 import 한 패키지가 바뀌어도 다시 검사한다.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const cacheDir = join("node_modules", ".cache", "tsc");

const projects = [{ name: "root", path: "tsconfig.json" }];
for (const group of ["packages", "apps"]) {
  const base = join(root, group);
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(group, entry.name, "tsconfig.json");
    if (entry.isDirectory() && existsSync(join(root, path))) {
      projects.push({ name: `${group}-${entry.name}`, path });
    }
  }
}

let failed = 0;
for (const { name, path } of projects) {
  const args = [tsc, "-p", path, "--incremental", "--tsBuildInfoFile"];
  args.push(join(cacheDir, `${name}.tsbuildinfo`));
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`타입 검사 실패: ${path}`);
    failed += 1;
  }
}

if (failed > 0) process.exit(1);
console.log(`타입 검사: tsconfig ${projects.length}개 통과.`);

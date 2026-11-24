import { defineConfig } from "vitest/config";

// 실제 Postgres 에 붙는 시험만 돈다. pnpm test:db(scripts/test-db.mjs)가 부른다.
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.db.test.ts"],
    // 시험 파일들이 같은 DB 의 스위치와 공급사 줄을 바꾼다. 파일을 하나씩 돈다.
    fileParallelism: false,
  },
});

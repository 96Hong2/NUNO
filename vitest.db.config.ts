import { defineConfig } from "vitest/config";

// 실제 Postgres 에 붙는 시험만 돈다. pnpm test:db(scripts/test-db.mjs)가 부른다.
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.db.test.ts"],
  },
});

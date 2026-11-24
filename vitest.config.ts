import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/src/**/*.test.{ts,tsx}", ".claude/hooks/*.test.mjs"],
    // 실제 DB 시험은 pnpm test:db 가 Postgres 를 띄운 뒤 vitest.db.config.ts 로 돈다.
    exclude: ["**/node_modules/**", "**/*.db.test.ts"],
  },
});

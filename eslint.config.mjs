import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const DOMAIN_HINT =
  "도메인은 이 값을 직접 만들지 않는다. application 에서 Clock, IdGenerator 같은 포트 값을 인자로 넘긴다.";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/coverage/",
    "**/.expo/",
    "**/web-build/",
    "docs/plans/evidence/",
  ]),

  js.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },

  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },

  // 도메인은 시각, 난수, 네트워크를 직접 부르지 않는다. 값은 인자로 받는다.
  {
    files: ["packages/*/src/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: DOMAIN_HINT },
        { object: "Math", property: "random", message: DOMAIN_HINT },
        { object: "crypto", property: "randomUUID", message: DOMAIN_HINT },
        { object: "performance", property: "now", message: DOMAIN_HINT },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "도메인은 네트워크를 부르지 않는다. application 에 포트를 두고 앱 어댑터가 구현한다.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: DOMAIN_HINT,
        },
      ],
    },
  },

  // 패키지 공개 면은 이름을 하나씩 적는다. export * 는 안쪽 이름을 몰래 내보낸다.
  {
    files: ["packages/*/src/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message:
            "공개 면에서 export * 를 쓰지 않는다. 밖에서 쓸 이름만 export { 이름 } 으로 적는다.",
        },
      ],
    },
  },

  // 시험은 모두 돌고, 모두 무언가를 단언한다.
  {
    files: ["**/*.test.ts"],
    plugins: { vitest },
    rules: {
      "vitest/no-focused-tests": ["error", { fixable: false }],
      "vitest/no-disabled-tests": "error",
      "vitest/expect-expect": "error",
    },
  },
);

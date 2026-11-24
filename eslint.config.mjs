import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const DOMAIN_HINT =
  "도메인은 이 값을 직접 만들지 않는다. application 에서 Clock, IdGenerator 같은 포트 값을 인자로 넘긴다.";

const DYNAMIC_IMPORT_HINT =
  "동적 import() 는 경계 검사가 보지 못한다. 맨 위 import 문으로 쓰고, 바깥 기능은 포트로 받는다.";

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
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
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
  // 전역 객체(globalThis 등)를 거치거나 이름을 바꿔 부르는 길도 막는다.
  {
    files: ["packages/*/src/domain/**/*.{ts,tsx,mts,cts}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: DOMAIN_HINT },
        { object: "Math", property: "random", message: DOMAIN_HINT },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "도메인은 네트워크를 부르지 않는다. application 에 포트를 두고 앱 어댑터가 구현한다.",
        },
        ...["globalThis", "self", "window", "crypto", "performance"].map((name) => ({
          name,
          message: `도메인에서 막은 전역이다. ${DOMAIN_HINT}`,
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: DOMAIN_HINT,
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: `Date() 는 지금 시각 문자열을 낸다. ${DOMAIN_HINT}`,
        },
        {
          selector: "NewExpression[callee.property.name='Date']",
          message: `전역 객체를 거쳐 Date 를 만들지 않는다. ${DOMAIN_HINT}`,
        },
        {
          selector:
            "CallExpression[arguments.length=0][callee.property.name=/^format(ToParts)?$/][callee.object.callee.property.name='DateTimeFormat']",
          message: `인자 없는 format() 은 지금 시각을 쓴다. ${DOMAIN_HINT}`,
        },
        { selector: "ImportExpression", message: DYNAMIC_IMPORT_HINT },
      ],
    },
  },

  // application 도 동적 import 로 경계 검사를 건너뛰지 않는다.
  {
    files: ["packages/*/src/application/**/*.{ts,tsx,mts,cts}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression", message: DYNAMIC_IMPORT_HINT },
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

  // 시험은 모두 돌고, 모두 무언가를 단언한다. 조건부 건너뛰기와 매처 없는 expect 도 막는다.
  {
    files: ["**/*.test.{ts,tsx,mjs}"],
    plugins: { vitest },
    rules: {
      "vitest/no-focused-tests": ["error", { fixable: false }],
      "vitest/no-disabled-tests": "error",
      "vitest/expect-expect": "error",
      "vitest/valid-expect": "error",
      "no-restricted-properties": [
        "error",
        ...["it", "test", "describe"].flatMap((object) =>
          ["skipIf", "runIf"].map((property) => ({
            object,
            property,
            message: "조건으로 시험을 건너뛰지 않는다. 실패하는 시험은 실패한 채로 두고 알린다.",
          })),
        ),
      ],
    },
  },

  // Playwright e2e 도 모두 돈다. test.only, test.describe.skip, test.fixme 같은 꼴을 막는다.
  {
    files: ["e2e/**/*.spec.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^(only|skip|fixme)$/]",
          message:
            "e2e 시험을 골라 돌리거나 건너뛰지 않는다. 실패하는 시험은 실패한 채로 두고 알린다.",
        },
      ],
    },
  },
);

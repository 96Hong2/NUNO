// 경계 규칙. 경로는 import 를 실제 파일로 푼 뒤 판정한다(상대 경로, 패키지 이름, import type 모두).
// 공유 패키지는 업무 로직이 없는 clock, ids, device-db 셋뿐이다.
const SHARED = "clock|ids|device-db";
const PUBLIC_ENTRY = "src/(index|testing/index)\\.ts$";
const TEST_FILE = "\\.test\\.tsx?$";

// 앱 기능 SDK. 새 SDK 를 들이면 여기에 더한다. 화면 틀(react-native, expo-router 등)은 넣지 않는다.
const FEATURE_SDKS = [
  "expo-sqlite",
  "expo-crypto",
  "expo-file-system",
  "expo-image-picker",
  "expo-camera",
  "expo-media-library",
  "expo-notifications",
  "expo-secure-store",
  "expo-apple-authentication",
  "react-native-purchases",
  "@supabase/[^/]+",
].join("|");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "import 한 모듈을 찾지 못했다. 패키지를 package.json 에 더하거나, 다른 패키지는 exports 에 있는 공개 면(@nuno/<이름>)으로 가져온다.",
      from: {},
      to: { couldNotResolve: true },
    },

    // 1. 도메인은 같은 패키지 domain 과 @nuno/clock 공개 면만 쓴다.
    {
      name: "domain-no-react-native",
      severity: "error",
      comment:
        "도메인은 react-native 를 쓰지 않는다. 화면이 필요하면 apps/mobile 에서 이 도메인을 불러 쓴다.",
      from: { path: "^packages/[^/]+/src/domain/", pathNot: TEST_FILE },
      to: {
        path: "(^|node_modules/)(react|react-native|react-dom|expo|expo-[^/]+|@expo/[^/]+)(/|$)",
      },
    },
    {
      name: "domain-allowlist",
      severity: "error",
      comment:
        "도메인은 같은 패키지 domain 과 @nuno/clock 만 import 한다. 바깥 기능이 필요하면 application 에 포트를 선언하고 apps/mobile 에서 구현해 넘긴다.",
      from: { path: "^packages/([^/]+)/src/domain/", pathNot: TEST_FILE },
      to: { pathNot: ["^packages/$1/src/domain/", "^packages/clock/src/index\\.ts$"] },
    },

    // 2. application 은 같은 패키지 domain, application 과 공유 패키지 공개 면만 쓴다.
    {
      name: "application-allowlist",
      severity: "error",
      comment:
        "application 은 같은 패키지 domain, application 과 @nuno/clock, @nuno/ids, @nuno/device-db 만 import 한다. 계층은 domain 과 application 둘뿐이다. 바깥 기능은 포트로 선언하고 apps/mobile/src/adapters 에서 구현한다.",
      from: { path: "^packages/([^/]+)/src/application/", pathNot: TEST_FILE },
      to: {
        pathNot: [
          "^packages/$1/src/(domain|application)/",
          `^packages/(${SHARED})/src/index\\.ts$`,
        ],
      },
    },

    // 3. 패키지 밖에서는 공개 면 두 곳만 들어간다.
    {
      name: "outside-only-public-entry",
      severity: "error",
      comment:
        "패키지 안쪽 경로를 import 하지 않는다. @nuno/<이름> 이나 @nuno/<이름>/testing 으로 가져오고, 없는 이름은 그 패키지 src/index.ts 에서 내보낸다.",
      from: { pathNot: "^packages/" },
      to: { path: "^packages/[^/]+/src/", pathNot: `^packages/[^/]+/${PUBLIC_ENTRY}` },
    },

    // 4. 컨텍스트끼리 직접 잇지 않는다. 새 컨텍스트도 규칙을 고치지 않고 막힌다.
    {
      name: "no-cross-context",
      severity: "error",
      comment:
        "다른 컨텍스트 패키지를 import 하지 않고, 공유 패키지(clock, ids, device-db)는 공개 면으로만 쓴다. 다른 컨텍스트가 필요하면 application 에 포트를 선언하고 apps/mobile/src/composition 에서 꽂는다.",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/",
        pathNot: ["^packages/$1/", `^packages/(${SHARED})/${PUBLIC_ENTRY}`],
      },
    },

    // 5. 시험 대역은 시험에서만 쓴다.
    {
      name: "testing-only-in-tests",
      severity: "error",
      comment:
        "@nuno/*/testing 은 *.test.ts 와 e2e/ 에서만 import 한다. 앱 코드에는 apps/mobile/src/adapters 의 실제 어댑터를 쓴다.",
      from: { pathNot: [TEST_FILE, "^e2e/", "^packages/[^/]+/src/testing/"] },
      to: { path: "^packages/[^/]+/src/testing/" },
    },

    // 6. 바깥 SDK 는 앱 어댑터에서만, 어댑터는 composition 에서만 쓴다.
    {
      name: "sdk-only-in-adapters",
      severity: "error",
      comment:
        "바깥 SDK 는 apps/<앱>/src/adapters/ 에서만 import 한다. 어댑터는 composition 에서 만들어 화면에 넘긴다.",
      from: { pathNot: "^apps/[^/]+/src/adapters/" },
      to: { path: `(^|node_modules/)(${FEATURE_SDKS})(/|$)` },
    },
    {
      name: "adapters-only-in-composition",
      severity: "error",
      comment: "어댑터는 composition 에서 만들어 화면에 넘긴다.",
      from: { pathNot: ["^apps/[^/]+/src/(adapters|composition)/", TEST_FILE] },
      to: { path: "^apps/[^/]+/src/adapters/" },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["react-native", "import", "default"],
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};

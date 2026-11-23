# plan_T1: 모바일 앱 DDD 아키텍처와 AI 개발 규칙 세우기

> 로드맵: 작업 폴더 `로드맵/NUNO 로드맵 v1.md` 의 T1 (저장소에는 PR A 에서 `docs/roadmap.md` 로 옮긴다)
> 작성 2026-11-24 · 상태: 리뷰 반영

## 목표

AI 가 같은 규칙으로 기능을 반복해 더하고 고칠 수 있는 저장소를 세운다. `pnpm web` 으로 빈 앱이 뜨고, 규칙을 어기면 검사가 막는다.

## DoD (로드맵 원문, 번호는 이 파일에서 붙임)

- [ ] D1 [명령] `pnpm install` 뒤 `pnpm verify:fast` 가 타입 검사, 린트, 경계 검사, 단위 시험을 돌고 통과한다.
- [ ] D2 [명령] `packages/twin` 도메인 파일에 `react-native` import 를 넣으면 경계 검사가 실패한다. 실패 문구에 고치는 법이 한 문장 있다.
- [ ] D3 [명령] 같은 도메인 파일에 `Date.now()`, `Math.random()`, `fetch` 를 넣으면 린트가 실패한다.
- [ ] D4 [명령] 앱 코드가 `packages/twin` 의 `src/domain` 안쪽 경로를 import 하면 타입 검사나 경계 검사가 실패한다.
- [ ] D5 [명령] 시험 파일에 `.only`, `.skip`, 단언 없는 시험 중 하나를 넣으면 린트가 실패한다.
- [ ] D6 [명령] `pnpm new:context wardrobe` 를 돌리면 세 계층 틀이 생기고 `pnpm verify:fast` 가 그대로 통과한다.
- [ ] D7 [명령] 룰 색인에 없는 `.claude/rules/*.md` 파일이 있거나 `paths:` 가 빠지면 `pnpm verify:fast` 가 실패한다.
- [ ] D8 [명령] `AGENTS.md` 의 작업 루프 줄이 전역 `task-dod-loop` 스킬을 가리키고, 새 세션의 스킬 목록에 그 스킬이 보인다.
- [ ] D9 [명령] 일부러 넣은 타입 오류 하나를 Stop 훅이 막고 이유를 보인다. 이 확인은 한 번만 한다.
- [ ] D10 [명령] Claude 가 `git commit --no-verify` 를 부르면 PreToolUse 훅이 막는다.
- [ ] D11 [명령] PR 하나가 CI `pnpm verify` 를 통과해 squash 로 머지된다.
- [ ] D12 [명령] `gh api repos/96Hong2/NUNO/branches/main/protection` 응답에 필수 검사 `verify` 와 관리자 우회 금지가 있다.
- [ ] D13 [웹화면] Claude 브라우저 창에서 `.claude/launch.json` 의 이름으로 앱이 열린다. `pnpm e2e` 가 통과한다.
- [ ] D14 [명령] 새 세션 `/context` 에 루트 `CLAUDE.md` 가 보이고, 터미널 Loaded 줄에 `apps/mobile/CLAUDE.md` 가 보인다.
- [ ] D15 [명령] `wc -m CLAUDE.md` 가 150~250 이다. 저장소에 `CLAUDE.local.md` 가 없고, Stop 훅에 `stop_hook_active` 확인이 없다.
- [ ] D16 [웹화면] `pnpm web` 으로 연 브라우저에서 하단 「홈」, 「피팅룸」, 「마이」 를 누르면 머리글에 그 탭 이름이 보이는 빈 화면이 열린다. 하단에 「탐색」 과 「찜」 은 없다.
- [ ] D17 [웹화면] 「피팅룸」 위쪽 「코디」, 「옷장」, 「트윈」, 「룩북」 칸을 누르면 그 칸의 빈 화면이 열린다. 「스토어」 칸은 없다.
- [ ] D18 [웹화면] 개발 빌드에서 「저장소 보기」 를 열면 쓰는 기기 저장소 어댑터 이름(expo-sqlite 또는 wa-sqlite)과 시험으로 쓴 값 한 줄이 보인다. 새로고침 뒤에도 그 값이 남는다.
- [ ] D19 [명령] `plan_T1.md` 에 expo-sqlite 웹 읽기 쓰기 결과와 고른 웹 어댑터가 있다. Skia 웹 빌드 결과도 있다.
- [ ] D20 [iOS] Xcode 설치 뒤 iOS 시뮬레이터에 같은 빈 셸이 뜬다.

## 확인한 사실 (2026-11-24)

| 무엇 | 확인한 것 | 출처 |
| --- | --- | --- |
| 판 | expo 58.0.26, expo-router 58.0.32, react-native 0.88.1 | npm view |
| 판 고정 | typescript ~6.0.3(typescript-eslint 8.74 가 6.1 미만만 받음, latest 7.0 은 못 씀). 앱 의존성은 `expo install` 로만 | npm view, Expo 58 템플릿 |
| Skia | Expo 58 고정판 `@shopify/react-native-skia` 2.14.0, reanimated 4.7.1, worklets 0.13.0 | bundledNativeModules |
| pnpm | SDK 54 이후 isolated 지원, 문제 시 hoisted. pnpm 11 이상은 `nodeLinker`, `allowBuilds` 를 `pnpm-workspace.yaml` 에서만 읽고 허락 안 된 빌드 스크립트에 멈춤 | docs.expo.dev, pnpm 문서 |
| expo-sqlite 웹 | wasm 자산과 COOP, COEP 헤더. 저장은 OPFS 라 localhost 나 https 에서만. 웹은 배타 트랜잭션 미지원. 같은 DB 를 연 탭 둘은 충돌 | expo 58 문서와 소스 |
| dependency-cruiser | 기본값은 package exports 를 안 읽고(`exportsFields: []`), 타입만 가져오는 import 를 안 봄 | dependency-cruiser 문서 |
| vitest 린트 | `@vitest/eslint-plugin` 의 `no-focused-tests`, `no-disabled-tests`, `expect-expect` | npm view |
| 훅 | PreToolUse 는 exit 2 나 `permissionDecision: deny`, `onFailure: "block"` 있음. Stop 은 `{"decision":"block"}`, 연속 상한 8회. 설정 편집은 세션에 바로 반영 | code.claude.com hooks |
| 룰과 지시 | `.claude/rules/*.md` 의 `paths:` 로 경로 로드. 하위 CLAUDE.md 는 그 폴더 파일을 볼 때 로드. `@AGENTS.md` import 동작 | code.claude.com memory |
| Playwright | webServer 기본 대기 60초. Metro 는 첫 요청 때 번들을 만든다 | Playwright 문서 |
| 이 Mac | Node 26.13.1(node:sqlite 플래그 없이 동작), pnpm 12.21.0. Xcode 없음. `wc -m` 은 LANG 이 비면 바이트를 셈 | 직접 확인 |

## 저장소 모양

```
NUNO/
├── CLAUDE.md              @AGENTS.md + Claude 전용 두 줄 (200자 내외)
├── AGENTS.md              정본: 명령, 어디를 고치나(컨텍스트 지도), 늘/묻는다/안 한다, 룰 색인
├── GLOSSARY.md            화면 이름과 코드 이름
├── .claude/
│   ├── rules/             domain.md, mobile-ui.md, tests.md (파일마다 paths:)
│   ├── hooks/             pre-tool-use.mjs, post-tool-use.mjs, stop.mjs
│   ├── settings.json      훅 셋
│   └── launch.json        mobile-web (port 8090)
├── apps/mobile/           Expo 58, Expo Router
│   ├── CLAUDE.md, AGENTS.md
│   ├── app/               (tabs)/home, (tabs)/fitting/[coordi|closet|twin|lookbook], (tabs)/my, dev/storage
│   └── src/
│       ├── adapters/      expo-sqlite.ts, system-clock.ts, uuid.ts  ← 바깥 SDK 는 여기만
│       └── composition/   device-db.ts (어댑터를 만들어 화면에 넘김, 컨텍스트를 잇는 자리)
├── packages/
│   ├── twin/              src/domain, src/application, src/index.ts
│   ├── clock/             포트 타입, 한국 시간대 헬퍼, src/testing(고정 시계)
│   ├── ids/               포트 타입, src/testing(순번 ID)
│   └── device-db/         SqlDatabase 포트(비동기), 옮기기 실행기, src/testing(node:sqlite 어댑터)
├── scripts/               new-context.mjs, check-rules-index.mjs
├── e2e/                   Playwright
├── docs/                  roadmap.md, adr/, plans/
└── .github/workflows/verify.yml
```

## 설계 결정

| 결정 | 고른 안 | 버린 안과 까닭 |
| --- | --- | --- |
| 저장소 형태 | pnpm 모노레포, `apps/mobile` 과 `packages/<컨텍스트>` | 앱 한 폴더 안 features: 경계를 기계로 막기 어렵다 |
| 컨텍스트 안 계층 | `src/domain`(순수), `src/application`(유스케이스와 포트), `src/index.ts`(이름을 하나씩 적어 내보냄, `export *` 금지) | 처음부터 네 계층: 빈 폴더를 AI 가 채울 자리로 읽는다 |
| 바깥 SDK | 쓰는 앱의 `src/adapters/` 에 둔다. 앱 둘 이상이 쓰게 되면 `packages/<컨텍스트>/src/adapters/<SDK>/` 로 옮긴다 | 패키지가 expo 를 의존: 도메인 시험이 Expo 없이 돌지 않는다 |
| 실제 시계와 UUID | `apps/mobile/src/adapters/` 에 둔다. `clock`, `ids` 는 포트 타입과 순수 함수, `./testing` 만 낸다 | 패키지에 실제 구현: 도메인이 패키지를 거쳐 시각과 난수를 부른다 |
| 시험 대역 | `src/testing/index.ts` 에 두고 exports `./testing` 으로만 낸다. 시험과 e2e 에서만 import | 공개 면에 섞음: Metro 가 node:sqlite 를 번들에 넣으려 한다 |
| 컨텍스트끼리 | 직접 import 금지. 필요한 쪽이 자기 application 에 포트를 선언하고, `apps/mobile/src/composition` 이 상대 공개 면으로 구현해 꽂는다. 공유 패키지는 `clock`, `ids`, `device-db` 셋이고 업무 로직을 두지 않는다 | 자유 참조: 경계가 무너진다 |
| 지금 만드는 컨텍스트 | `twin` 하나. 프리셋 키 여섯(`PresetTwinKey`)과 키 확인 함수 하나, 시험 하나. 그림과 기준점은 T2-2 | 아홉 개 미리 생성: 전역 규칙 위반 |
| 기기 저장소 | `device-db` 는 비동기 포트 `SqlDatabase` 와 `transaction(async tx => …)`, 판 목록을 차례로 돌리는 옮기기 실행기만 가진다. 각 컨텍스트가 자기 표의 옮기기 단계를 낸다. 판 순서는 `apps/mobile/src/composition/migrations.ts` 한 곳. `schema_migrations` 와 실제 표는 T2-1 | device-db 가 모든 표를 앎: Task 마다 공유 패키지를 고친다 |
| D18 시험 값 | 개발 빌드에서만 `CREATE TABLE IF NOT EXISTS dev_probe` 로 만드는 표에 쓴다. 판 사슬에 넣지 않는다 | T1 에 판 1 을 씀: T2-1 판 번호와 겹친다 |
| 기기 저장소 웹 | expo-sqlite 웹을 먼저 쓴다. 2시간 안에 안 되면 OPFS 에 저장하는 wa-sqlite 어댑터를 꽂는다. 웹은 http://localhost 로만 연다 | sql.js: 새로고침하면 값이 사라져 D18 을 통과하지 못한다 |
| 화면 시험 | Playwright 로 Expo 웹(port 8090)을 띄운다 | Detox, Maestro: Xcode 가 없다 |
| 단위 시험 | vitest 5 | node --test: `.only` 를 막는 린트 규칙이 없다 |
| 훅 언어 | Node `.mjs` | 셸과 jq: jq 가 없을 수 있다 |
| Stop 훅 | `stop_hook_active` 확인을 넣지 않는다(연속 상한 8회가 끊음). 바뀐 것이 없거나 docs 와 *.md 만 바뀌었으면 바로 통과. verify:fast 는 incremental 과 캐시로, timeout 180초 | 확인을 넣음: 한 턴에 한 번만 막는다(전역 규칙) |
| PostToolUse | prettier 와 `eslint --cache` 로 고친 파일 하나만. 타입 정보 규칙은 verify:fast 에서만. timeout 30초 | 매 편집 전체 린트: 느려진다 |
| PreToolUse | Bash 의 `git commit --no-verify`, `-n`, `git push --no-verify` 를 막는다. 보호 경로(`.claude/hooks/`, `.github/`)를 Edit, Write, Bash 쓰기로 고치면 막는다. `origin/main` 에 이미 있는 시험 파일 고치기를 막는다 | Edit, Write 만 봄: Bash 로 우회된다 |
| CLAUDE.md | 200자 내외. 내용은 AGENTS.md 와 경로 룰로 | 긴 CLAUDE.md: 매 세션 로드 비용 |
| Skia | 머지하지 않는 시험 브랜치에서 웹 빌드만 본다. 결과만 이 파일에 적고 main 에 넣지 않는다. 쓰는 Task(T9)에서 그때 판으로 설치 | main 에 설치: T2 부터 쓰지 않는 의존성을 진다 |

## 경계 규칙 (dependency-cruiser)

options: `tsConfig`, `tsPreCompilationDeps: true`, `enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["react-native", "import", "default"] }`. 풀리지 않는 import 는 `not-to-unresolvable` 로 실패한다.

1. `packages/*/src/domain/**` 은 같은 패키지 domain 과 `@nuno/clock` 공개 면(순수 한국 시간대 헬퍼, 포트 타입)만 import 한다. 그 밖의 npm 패키지와 node 내장은 모두 실패한다(허용 목록). react, react-native, expo 에는 「도메인은 react-native 를 쓰지 않는다. 화면이 필요하면 apps/mobile 에서 이 도메인을 불러 쓴다.」 문구를 단 규칙을 따로 둔다.
2. `packages/*/src/application/**` 은 같은 패키지와 `clock`, `ids`, `device-db` 공개 면만(허용 목록).
3. `packages/` 밖 파일은 `packages/[^/]+/src/` 안쪽을 import 하지 못한다. 허용은 `src/index.ts` 와 `src/testing/index.ts` 둘이다. 상대 경로, 별칭, `import type` 모두 풀린 경로로 판정한다.
4. `^packages/([^/]+)/` 파일이 다른 `packages/` 파일을 import 하면 실패한다. 예외는 같은 패키지와 공유 패키지 `clock`, `ids`, `device-db`(group matching). 새 컨텍스트는 규칙을 고치지 않아도 막힌다.
5. `@nuno/*/testing` 은 `*.test.ts` 와 `e2e/` 에서만 import 한다.
6. 바깥 SDK(expo-*, react-native-* 중 앱 기능 SDK)는 `apps/*/src/adapters/**` 에서만, 어댑터는 `apps/*/src/composition/**` 에서만 import 한다. 문구: 「어댑터는 composition 에서 만들어 화면에 넘긴다.」

## 린트 규칙 (eslint.config.mjs)

- 도메인(`packages/*/src/domain/**`): `Date.now`, 인자 없는 `new Date()`, `Math.random`, `crypto.randomUUID`, `performance.now`, `fetch` 금지.
- 시험(`**/*.test.ts`): `@vitest/eslint-plugin` 의 `no-focused-tests`(자동 고침 끔), `no-disabled-tests`, `expect-expect` 를 error.
- `src/index.ts`: `export *` 금지.

## 명령과 판 고정

- 루트 스크립트: `typecheck`(tsc -b, incremental), `lint`(eslint --cache), `depcruise`(--cache), `test`(vitest run), `check:rules`. `verify:fast` 는 다섯을 차례로. `verify` 는 PR A, B 에서 `verify:fast` 와 같고, PR C 에서 `verify:fast && pnpm e2e`.
- `new:context`, `web`(`pnpm --filter mobile exec expo start --port 8090`), `e2e`.
- `packageManager: pnpm@12.21.0`, `.nvmrc` 26. `pnpm-workspace.yaml` 에 `nodeLinker: hoisted`, `allowBuilds`, `catalog:`(typescript ~6.0.3, react, react-native).
- tsconfig: `expo/tsconfig.base` 를 잇고 moduleResolution bundler. `@nuno/*` 를 `paths` 로 잇지 않고 `workspace:*` 로 잇는다.
- `app.json`: `web.output: "single"`, typedRoutes 끔, expo-router 플러그인 headers 와 metro.config.js 에 COOP, COEP, wasm 자산.

## 순서 (PR 단위)

1. PR A 「T1-1~T1-3: 지시 파일, 룰, docs, 모노레포, twin, clock, ids, 검사, CI」
   - 300줄을 넘는다. `docs/roadmap.md` 는 로드맵 원문을 옮긴 것이고 나머지는 대부분 설정 파일이라 나누면 각 PR 이 혼자 검사를 통과하지 못한다(PR 설명에 적는다).
   - D2~D7 의 일부러 깨뜨리는 확인은 이 PR 에서, 훅 등록 전에 임시 파일로 끝낸다.
   - CI 가 한 번 돈 뒤, 머지 전에 저장소를 squash 만 허용으로 바꾸고 브랜치 보호(필수 검사 `verify`, `enforce_admins`, PR 필수 승인 0명)를 건다(기획자 허락 2026-11-24).
2. PR B 「T1-4: 훅 셋과 작업 루프 연결」
   - 훅 스크립트는 예시 입력 JSON 을 파이프로 넣어 막기와 통과를 먼저 확인하고 settings.json 에 등록한다.
3. PR C 「T1-5: Expo 웹 빈 셸, device-db, expo-sqlite 어댑터, 저장소 보기, e2e, launch.json」
   - CI 에 Playwright chromium 설치를 더하고 `verify` 에 e2e 를 붙인다.
   - Skia 웹 확인은 머지하지 않는 브랜치 `t1/skia-probe` 에서 한다.

## 명령 DoD 확인 절차

일부러 깨뜨리는 확인은 임시 파일로 한 번만 하고 지운다. 출력은 `docs/plans/evidence/T1/D<번호>.txt` 에 둔다.

| DoD | PR | 확인 절차 | 통과 기준 |
| --- | --- | --- | --- |
| D1 | A, C 에서 다시 | 새로 받은 저장소에서 `pnpm install && pnpm verify:fast` | 다섯 단계가 돌고 exit 0 |
| D2 | A, C 에서 다시 | `packages/twin/src/domain/probe.ts` 에 `import 'react-native'`, `pnpm depcruise` | exit 1, 고치는 법 문장 출력 |
| D3 | A | 같은 파일에 `Date.now()`, `Math.random()`, `fetch` 를 하나씩, `pnpm lint` 세 번 | 세 번 모두 exit 1 |
| D4 | C | `apps/mobile` 임시 파일에서 값 import(`@nuno/twin/src/domain/…`) 한 번, 상대 경로 `import type` 한 번 | 두 번 모두 typecheck 나 depcruise 실패 |
| D5 | A | 임시 시험 파일 셋(`.only`, `.skip`, 단언 없음), `pnpm lint` | 셋 다 exit 1 |
| D6 | A | `pnpm new:context wardrobe && pnpm verify:fast`, wardrobe 도메인에서 `@nuno/twin` import 도 시험. 끝나면 `packages/wardrobe` 를 지우고 커밋하지 않음 | 첫째 exit 0, 둘째 실패 |
| D7 | A | 색인에 없는 룰 파일, `paths:` 없는 룰 파일을 따로 두고 `pnpm verify:fast` | 두 번 다 exit 1, 파일 이름 출력 |
| D8 | B | `claude -p "ok" --output-format stream-json --verbose --max-turns 1` 의 init 줄 skills, 또는 터미널 탭 `/skills` 화면. `grep -n task-dod-loop AGENTS.md` | 둘 다 task-dod-loop |
| D9 | B, 한 번 | `packages/twin/src/domain/probe.ts` 에 타입 오류를 넣고 턴을 끝냄. 지운 뒤 다음 Stop 통과 | reason 에 tsc 오류 줄 |
| D10 | B | 예시 JSON 파이프, 그다음 세션에서 Bash `git commit --no-verify -m probe` | 거부, `git log -1` 그대로 |
| D11 | 보호 뒤 첫 머지 | `gh pr view <번호> --json state,statusCheckRollup`, `git log -1 --format=%P main` | verify SUCCESS, MERGED, 부모 하나 |
| D12 | A 머지 전 | `gh api …/protection --jq '{c:.required_status_checks.contexts,a:.enforce_admins.enabled}'` | c 에 verify, a true |
| D13 | C | `preview_start` 이름 `mobile-web`, `pnpm e2e` | 홈 화면 스크린숏, exit 0 |
| D14 | C 머지 뒤 | 터미널 탭에서 `claude` 를 띄워 `/context`, `apps/mobile/app/_layout.tsx 를 읽어줘` | `CLAUDE.md` 줄과 `apps/mobile/CLAUDE.md` Loaded 줄 |
| D15 | B 뒤 | `LC_ALL=en_US.UTF-8 wc -m CLAUDE.md`, `git ls-files \| grep -c CLAUDE.local.md`, `grep -rn stop_hook_active .claude/` | 150~250, 0, 출력 없음 |
| D19 | C | 「기술 검토 결과」 절 채움 | 결과 다섯과 고른 어댑터 |
| D20 | 없음 | Xcode 가 없어 「환경 없음」 | 판정 표와 `docs/roadmap.md` 대기 목록에 있음 |

## 화면 테스트 시나리오

| DoD | 어디서 | 무엇을 하면 | 무엇이 보여야 하나 |
| --- | --- | --- | --- |
| D13 | Claude 브라우저 창 | launch.json 의 `mobile-web` 으로 연다 | 앱 첫 화면(홈) |
| D16 | 하단 탭 | 「홈」, 「피팅룸」, 「마이」 를 차례로 누른다 | 머리글이 그 이름, 「탐색」 「찜」 없음 |
| D17 | 피팅룸 위쪽 | 「코디」, 「옷장」, 「트윈」, 「룩북」 을 누른다 | 그 칸의 빈 화면, 「스토어」 없음 |
| D18 | 마이 → 개발 메뉴 「저장소 보기」 | 「시험 값 쓰기」 를 누르고 새로고침 | 어댑터 이름과 `dev_probe` 값 한 줄이 남음, 표마다 행 목록 |
| 공통 | 브라우저 콘솔 | 위 시나리오 동안 | 오류 0 |

증거 스크린숏은 `docs/plans/evidence/T1/` 에 둔다. D18 은 탭 하나에서만 판정한다(OPFS 잠금).

## 위험과 되돌리는 법

1. expo-sqlite 웹이 안 되면 wa-sqlite(OPFS) 어댑터로 바꾼다. 포트가 같아 앱 코드는 그대로다.
2. Skia 가 웹 빌드를 깨면 결과를 적고, 로드맵의 「SDK 57 로 내림」 과 「SDK 58 을 두고 T9 로 미룸」 가운데 기획자에게 묻는다. 답 전에는 SDK 를 바꾸지 않는다.
3. 첫 `pnpm install` 이 허락 안 된 빌드 스크립트로 멈추면 그 패키지를 확인해 `allowBuilds` 에 적는다.
4. Playwright 첫 시험 시간 초과: webServer timeout 180초, globalSetup 에서 첫 화면을 한 번 열어 번들을 미리 만든다.
5. 훅 설정 편집이 세션에 바로 반영되므로, 덜 된 훅이 Bash 와 Edit 를 막으면 settings.json 등록을 빼고 고친다.

## 리뷰 반영 (2026-11-24, 관점 넷, 지적 62건)

| 관점 | 지적 | 반영 |
| --- | --- | --- |
| DoD 충족 | D1~D20 중 16개에 판정 절차가 없음 | 반영: 「명령 DoD 확인 절차」 표 |
| DoD 충족 | sql.js 는 D18 을 못 지킴, 시험 값 표가 없음 | 반영: wa-sqlite 대안, `dev_probe` |
| DoD 충족 | D19 결과 칸, D7 색인 파일 자기 검사, D15 locale | 반영: 「기술 검토 결과」, 색인은 AGENTS.md 표, LC_ALL |
| DoD 충족 | D11, D12 순서와 필수 검사 이름, 승인 0명, squash 설정 | 반영: PR A 순서, job 이름 verify |
| 도메인 경계 | depcruise 가 exports 와 import type 을 못 봄 | 반영: options 세 개, not-to-unresolvable |
| 도메인 경계 | 규칙을 허용 목록 방식으로, 규칙 4 group matching, testing 공개 경로, SDK 는 adapters 에서만 | 반영: 경계 규칙 1~6 |
| 도메인 경계 | 실제 시계와 UUID 위치, 옮기기 함수 소유, 트랜잭션 계약, 컨텍스트끼리 잇는 법, `export *` | 반영: 설계 결정 표 |
| 단순함 | Skia 를 main 에 넣지 말 것, twin 은 키 여섯만, 룰은 셋 | 반영 |
| 단순함 | PR 1 을 문서만으로 나눌 것 | 반영 안 함: PR 셋으로 둔다. 문서만 먼저 머지하면 보호 없는 머지가 하나 생기고 다관점 리뷰가 한 번 더 든다 |
| 단순함 | new:context 는 파일 다섯만, wardrobe 는 커밋하지 않음 | 반영 |
| 실행 가능성 | 판 고정(TS 6.0.3, Skia 2.14.0), pnpm 11+ 설정 자리, Node 와 pnpm 고정 | 반영 |
| 실행 가능성 | Playwright 대기와 포트 8090, expo-sqlite 웹 조건(OPFS, 비동기, 탭 하나) | 반영 |
| 실행 가능성 | Stop 훅 속도, PostToolUse 속도, PreToolUse 우회(`-n`, Bash 쓰기), 기존 시험 기준 | 반영 |
| 실행 가능성 | `web.output: "single"`, typedRoutes 끔 | 반영 |
| 기획자에게 물을 것 | 로드맵 T1-5 「옮기기 함수 시험」 과 스키마 7절 「T1 은 표를 만들지 않음」 이 다름 | 묻지 않음: 실행기와 가짜 판 시험은 T1, `schema_migrations` 표는 T2-1 로 두면 두 문서 모두와 맞는다 |

## 기술 검토 결과 (D19)

| 확인 | 방법 | 결과 |
| --- | --- | --- |
| expo-sqlite 웹 읽기와 쓰기(2시간 상한) | 「저장소 보기」 에서 쓰고 새로고침 | |
| 웹에서 고유 색인과 검사 제약 | `dev_probe` 에 같은 key 두 번, CHECK 어기는 값 | |
| crossOriginIsolated | 브라우저 콘솔 | |
| 고른 웹 어댑터 | | |
| Skia 웹 빌드 | `t1/skia-probe` 에서 `expo export -p web` 와 `WithSkiaWeb` 화면 | |
| Reanimated 웹 빌드 | 같은 export 와 콘솔 | |

## 구현 중 바뀐 것

PR A (2026-11-24)

- typescript-eslint 8.74.0 은 출시 하루째라 pnpm 출시 대기 정책에 걸려 `~8.73.0` 을 쓴다. 받는 TS 범위는 같다(<6.1).
- `typecheck` 는 루트 references 대신 `tsc -b tsconfig.json packages/*/tsconfig.json` 이다. noEmit 프로젝트는 참조될 수 없다(TS6310).
- 그래서 패키지마다 noEmit, incremental 인 독립 tsconfig 를 두고, 새 컨텍스트는 glob 으로 잡힌다. new:context 는 references 가 있을 때만 더한다.
- 패키지 tsconfig 는 루트 `tsconfig.base.json` 을 잇는다. `expo/tsconfig.base` 는 PR C 의 `apps/mobile` 에서 잇는다.
- catalog 에는 지금 typescript 만 둔다. react, react-native 는 PR C 에서 `expo install` 판으로 더한다.
- 지금 의존성에는 빌드 스크립트가 없어 `allowBuilds` 를 두지 않았다.
- depcruise 는 위반 수를 종료 코드로 낸다(D2 는 exit 3). D2 는 「0 이 아님」 으로 판정했다.
- depcruise `--cache` 기본 전략은 커밋 전 새 파일을 놓쳐 `--cache-strategy content` 로 바꿨다.
- 고치는 법 문장이 출력에 보이도록 depcruise 를 `--output-type err-long` 으로 돈다.
- 경계 규칙 1, 2 는 `*.test.ts` 를 뺀다. 시험은 vitest 와 `testing` 대역을 import 해야 한다.
- 규칙 6 의 앱 기능 SDK 는 `.dependency-cruiser.cjs` 의 `FEATURE_SDKS` 목록에 적는다. 새 SDK 를 들이면 더한다.
- depcruise 는 지금 `packages` 만 본다. PR C 에서 `apps`, `e2e` 를 더한다.
- ESLint 에 `recommendedTypeChecked` 와 `consistent-type-imports` 를 더했다. D3 의 fetch 줄은 타입 정보 규칙 둘에도 걸린다.
- twin 은 `pnpm new:context twin` 으로 만든 뒤 domain 에 `preset-twin-key.ts` 와 시험을 더했다. application 은 `listPresetTwinKeys` 한 파일이다.
- clock 의 자기 시험은 고정 시계를 `./testing` 상대 경로로 가져온다. 자기 패키지 이름 import 는 쓰지 않는다.
- Actions 판은 조회한 최신 판인 checkout v7, setup-node v7, pnpm/action-setup v6 을 쓴다.
- `.prettierignore` 에 `**/*.md` 를 넣었다. 한국어 표를 prettier 가 다시 정렬하지 않게 한다.

## DoD 판정

D20 은 이 Mac 에 Xcode 가 없어 「환경 없음」 으로 적고 T1 완료 판정에서 뺀다. `docs/roadmap.md` 의 「iOS 와 사람 확인 대기」 목록에 넣는다.

| DoD | 판정 | 증거 |
| --- | --- | --- |
| D1 | 통과 (PR A, PR C 에서 다시) | `docs/plans/evidence/T1/D1.txt` |
| D2 | 통과 (exit 3, 고치는 법 문장 출력. PR C 에서 다시) | `docs/plans/evidence/T1/D2.txt` |
| D3 | 통과 (세 번 모두 exit 1) | `docs/plans/evidence/T1/D3.txt` |
| D4 | PR C 에서 판정 (`apps/mobile` 이 아직 없다) | |
| D5 | 통과 (셋 다 exit 1, `--fix` 뒤에도 `.only` 남음) | `docs/plans/evidence/T1/D5.txt` |
| D6 | 통과 (틀 다섯 파일 뒤 exit 0, twin import 는 exit 2) | `docs/plans/evidence/T1/D6.txt` |
| D7 | 통과 (두 경우 모두 exit 1, 파일 이름 출력) | `docs/plans/evidence/T1/D7.txt` |
| D8 | | |
| D9 | | |
| D10 | | |
| D11 | | |
| D12 | | |
| D13 | | |
| D14 | | |
| D15 | 일부 확인 (175자, CLAUDE.local.md 0. Stop 훅은 PR B 뒤 확인) | `docs/plans/evidence/T1/D15.txt` |
| D16 | | |
| D17 | | |
| D18 | | |
| D19 | | |
| D20 | 환경 없음 | Xcode 없음 |

# NUNO

옷 사진을 넣고 고른 트윈에 겹쳐 입혀 보는 Expo 모바일 앱과, 그 업무 로직 패키지를 담은 pnpm 모노레포다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm install` | 의존성을 설치한다. Node 판은 `.nvmrc`, pnpm 판은 `packageManager` 를 따른다 |
| `pnpm verify:fast` | 타입 검사, 린트, 경계 검사, 패키지 모양 검사, 단위 시험, 룰 색인 검사를 차례로 돈다 |
| `pnpm verify` | CI 필수 검사 `verify` 가 도는 전체 검사 |
| `pnpm new:context <이름>` | `packages/<이름>` 에 domain, application, 공개 면 틀을 만든다 |

## 무엇을 바꾸려면 어디를 고치나

| 바꾸려는 것 | 고칠 곳 |
| --- | --- |
| 프리셋 트윈 여섯, 트윈 꾸미기 계산 | `packages/twin` |
| 생년월일, 좋아하는 스타일, 온보딩과 처음 둘러보기 상태 | `packages/profile`: T2 에서 new:context 로 만든다 |
| 옷 정보, 옷장 두 칸 「내 옷」 `mine` 과 「담은 옷」 `wanted` | `packages/wardrobe`: T3 에서 new:context 로 만든다 |
| 겹쳐 입히기 순서, 「내 코디」, 최근 입혀 본 코디 | `packages/outfit`: T4 에서 new:context 로 만든다 |
| 룩북과 룩, 입은 옷 사본 | `packages/lookbook`: T5 에서 new:context 로 만든다 |
| 골드 원장, 묶음, 충전 | `packages/gold`: T7 에서 new:context 로 만든다 |
| 가입, 동의, 계정 삭제 | `packages/account`: T7 에서 new:context 로 만든다 |
| 신고, 차단 | `packages/safety`: T8 에서 new:context 로 만든다 |
| 공유 링크와 링크 끊기 | `packages/share`: T9 에서 new:context 로 만든다 |
| 시계 포트와 한국 날짜 헬퍼, ID 포트(시험용 고정 시계와 순번 ID 포함) | `packages/clock`, `packages/ids` |
| 기기 저장 판과 옮기기 단계 | 각 컨텍스트가 자기 표의 옮기기 단계를 낸다. 순서는 `apps/mobile/src/composition/migrations.ts` 한 곳(T2-1 에서 만든다) |
| 경계 규칙(무엇이 무엇을 import 하나), 앱 기능 SDK 목록 `FEATURE_SDKS` | `.dependency-cruiser.cjs` |
| 도메인 금지 호출, 시험 린트 | `eslint.config.mjs` |
| 패키지 계층 폴더, 시험 위치, `@nuno/*` 의존 선언 검사 | `scripts/check-packages.mjs` |
| 화면 이름과 코드 이름. 새 이름은 이 표에 먼저 더한다 | `GLOSSARY.md` |
| Task 목록, DoD 문장, Task 상태 | `docs/roadmap.md` |
| DoD 판정 | `docs/plans/plan_<TaskID>.md` 의 판정 표 |
| 되돌리기 어려운 결정 | `docs/adr/` |

## 늘 한다

- Task 는 전역 task-dod-loop 스킬로 한다. 순서는 plan 파일 → 리뷰 → 구현 → 화면 테스트 → DoD 전부 통과다.
- plan 파일은 `docs/plans/plan_<TaskID>.md` 다.
- 컨텍스트끼리 직접 import 하지 않는다. 필요한 쪽 application 에 포트를 두고 앱 composition 이 잇는다.
- 패키지 밖으로는 `src/index.ts` 에서 이름을 하나씩 내보낸다. 시험 대역은 `src/testing/index.ts` 로만 낸다.
- 패키지 `src` 아래에는 `domain`, `application`, `testing`, `index.ts` 만 둔다.
- 패키지가 쓰는 `@nuno/*` 는 `package.json` dependencies 에 `workspace:*` 로 적는다.
- 도메인은 시각과 ID 를 인자로 받는다. 한국 날짜는 `@nuno/clock` 의 `toKstDateString` 으로만 계산한다.
- 시험의 시각은 `fixedClock` 으로만 만든다.
- 끝났다는 판정은 `pnpm verify:fast` 통과로 한다.

## 먼저 묻는다

- 이미 main 에 머지된 판의 옮기기 단계를 고치거나 지울 때.
- plan 파일에 적지 않은 의존성을 들일 때. 앱 의존성은 `expo install` 로만 들인다.
- 경계 규칙이나 린트 규칙을 풀 때.
- `docs/roadmap.md` 의 DoD 문장이나 ADR 의 결정을 바꿀 때.
- plan 파일에 적고 리뷰를 거친 새 판과 새 의존성은 묻지 않고 진행한다.

## 하지 않는다

- main 에 직접 push 하지 않고, `--no-verify` 를 쓰지 않는다.
- 실패하는 시험을 skip 하거나 단언을 약하게 하지 않는다. 기대값을 실제 출력에서 베끼지 않는다.
- `export *`, `utils/`, `helpers/`, 쓰지 않는 컨텍스트 폴더를 만들지 않는다. `CLAUDE.local.md` 도 만들지 않는다.
- 공개 저장소라 비밀값, 개인 이름, PRD 원문을 넣지 않는다.

## 룰 색인

| 파일 | paths | 내용 |
| --- | --- | --- |
| `.claude/rules/domain.md` | `packages/*/src/domain/**`, `packages/*/src/application/**` | 순수 도메인, 포트, 계층별 import 범위 |
| `.claude/rules/mobile-ui.md` | `apps/mobile/**` | 화면 이름, 공개 면 import, 어댑터와 composition |
| `.claude/rules/tests.md` | `**/*.test.ts`, `**/*.test.tsx`, `e2e/**` | 시험을 두는 자리, 대역, 금지 사항 |

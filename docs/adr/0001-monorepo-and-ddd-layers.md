# ADR 0001: pnpm 모노레포, 컨텍스트별 패키지, 두 계층과 기계 경계

- 상태: 채택
- 날짜: 2026-11-24
- 관련 Task: T1

## 무슨 상황인가

NUNO 는 혼자 개발하고, 기능 대부분을 AI 가 반복해서 더하고 고친다.
같은 규칙이 수십 번의 세션 동안 지켜져야 한다.
글로 쓴 규칙은 부탁일 뿐이라서, 어기면 검사가 실패하는 구조가 필요했다.
첫 판(T2~T5)은 서버 없이 휴대폰 안에서 돌고, 뒤 Task(T6~T9)에서 서버가 붙는다.
업무 로직은 Expo 와 React Native 없이 Node 에서 시험할 수 있어야 한다.

## 무엇을 정했나

1. 저장소는 pnpm 모노레포다. 앱은 `apps/<기술>` 에 두고, 첫 앱은 `apps/mobile` 이다. 업무 로직은 `packages/<컨텍스트>` 에 둔다.
2. 컨텍스트 패키지는 `src/domain` 과 `src/application` 두 계층으로 시작한다. 공개 면은 `src/index.ts` 다.
   - `src/domain` 에는 순수 타입과 함수를, `src/application` 에는 유스케이스와 포트를 둔다.
   - `src` 아래에는 두 계층과 `src/testing`, `src/index.ts` 만 둔다. 그 밖 폴더는 `pnpm check:packages` 가 막는다.
3. 공개 면은 `package.json` 의 `exports` 로 닫는다. 내보내는 곳은 `"."` 와 `"./testing"` 둘뿐이다.
   - `"."` 는 `src/index.ts`, `"./testing"` 은 시험 대역 `src/testing/index.ts` 다.
4. `src/index.ts` 는 이름을 하나씩 적어 내보낸다. `export *` 는 린트가 막는다.
5. 컨텍스트끼리는 서로 import 하지 않는다. 필요한 쪽이 자기 application 에 포트를 선언한다.
   - `apps/mobile/src/composition` 이 상대 컨텍스트의 공개 면으로 그 포트를 구현해 꽂는다.
6. 업무 로직이 없는 공유 패키지는 `clock`, `ids`, `device-db` 셋으로 한정한다.
   - 시계와 ID 는 포트 타입과 순수 함수, 시험 대역만 둔다.
   - 공유 패키지도 같은 폴더 모양을 따른다. 순수 코드는 `src/domain` 에 두어 도메인 린트를 받는다.
7. 실제 시계, UUID, 바깥 SDK 는 그것을 쓰는 앱의 `src/adapters/` 에 둔다. 어댑터는 `src/composition/` 에서만 만든다.
8. 경계는 dependency-cruiser 로, 도메인 금지 호출과 시험 규칙은 ESLint 로 막는다.
   - 둘 다 `pnpm verify:fast` 에 들어가고, CI 필수 검사 `verify` 가 돈다.
9. 경계 판정은 import 를 실제 파일로 푼 경로로 한다. 상대 경로, 패키지 이름, `import type` 이 같은 규칙에 걸린다.
10. 새 컨텍스트는 `pnpm new:context <이름>` 으로 만든다. 쓰는 Task 가 올 때까지 폴더를 미리 만들지 않는다.
11. 패키지가 쓰는 `@nuno/*` 는 `package.json` dependencies 에 `workspace:*` 로 적는다. `pnpm check:packages` 가 확인한다.
12. 생년월일, 좋아하는 스타일, 온보딩과 처음 둘러보기 상태는 `packages/profile` 이 갖는다. T2 에서 만든다.
13. 기기 저장 표의 옮기기 단계는 그 표를 가진 컨텍스트가 낸다. 판 순서는 `apps/mobile/src/composition/migrations.ts` 한 곳에서 정한다.

## 왜 그렇게 정했나

- 패키지 경계가 있어야 「도메인이 react-native 를 import 한다」 같은 위반을 경로 규칙 한 줄로 막을 수 있다.
- 도메인이 시각, 난수, 네트워크를 직접 부르지 않으면 고정 시계와 순번 ID 로 시험이 매번 같은 결과를 낸다.
- 컨텍스트끼리 포트로만 이으면 한 컨텍스트를 고쳐도 다른 컨텍스트의 시험이 깨지지 않는다.
- 경계 규칙 `no-cross-context` 는 같은 패키지 이름을 묶어 판정한다. 새 컨텍스트가 생겨도 규칙을 고치지 않고 막힌다.
- 두 계층으로 시작하면 빈 `infrastructure/` 같은 폴더가 없다. AI 가 빈 자리를 채우려고 코드를 지어내지 않는다.
- 계층 밖 폴더를 막지 않으면 application 이 그 폴더를 거쳐 허용 목록을 한 단계 건너뛴다.
- 판 순서를 한 파일에 모으면 컨텍스트가 늘어도 옮기기 순서가 갈라지지 않는다. `device-db` 는 표를 몰라도 된다.

## 버린 안

| 버린 안 | 버린 까닭 |
| --- | --- |
| 앱 한 폴더 안 `features/` 폴더 | 기능 사이 import 를 경로 규칙으로 막기 어렵다 |
| 처음부터 domain, application, infrastructure, presentation 네 계층 | 빈 폴더를 AI 가 채울 자리로 읽는다 |
| 패키지가 expo SDK 를 직접 의존 | 도메인 시험이 Expo 없이 돌지 않는다 |
| `clock`, `ids` 패키지에 실제 구현 | 도메인이 패키지를 거쳐 시각과 난수를 부를 수 있다 |
| 컨텍스트끼리 자유 참조 | 경계가 무너지고 한 곳을 고치면 여러 곳이 깨진다 |
| 시험 대역을 공개 면에 섞음 | 앱 번들러가 Node 전용 시험 코드를 앱에 넣으려 한다 |
| tsconfig `paths` 로 `@nuno/*` 를 잇기 | 번들러, 시험 도구, 경계 검사가 서로 다르게 풀 수 있다. `workspace:*` 와 `exports` 하나로 맞춘다 |

## 무엇을 잃나

- 컨텍스트 하나가 다른 컨텍스트 값을 쓰려면 포트 타입과 composition 코드가 더 든다.
- 설정 파일(경계 규칙, 린트, tsconfig, 패키지마다 package.json)이 많아 첫 PR 이 크다.
- 바깥 SDK 를 새로 들이면 `.dependency-cruiser.cjs` 의 `FEATURE_SDKS` 에 손으로 더한다.
- 더하지 않으면 경계 규칙 `sdk-only-in-adapters` 가 그 SDK 를 막지 못한다.
- 앱 둘 이상이 같은 SDK 어댑터를 쓰게 될 수 있다. 그때는 어댑터를 둘 패키지 자리를 새로 정하고 이 ADR 을 고친다.

## 이어지는 문서

- 지시 파일과 컨텍스트 지도: `AGENTS.md`
- 경계 규칙 원문: `.dependency-cruiser.cjs`
- 린트 규칙 원문: `eslint.config.mjs`
- 이 결정을 세운 계획과 확인 결과: `docs/plans/plan_T1.md`

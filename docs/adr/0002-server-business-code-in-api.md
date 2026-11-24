# ADR 0002: 서버 업무 코드는 `apps/api/src/<컨텍스트>/` 에 둔다

- 상태: 기획자 확인 대기
- 날짜: 2026-11-25
- 관련 Task: T7

## 무슨 상황인가

T7 에서 가입, 동의, 골드 원장, 완성 룩 작업 같은 서버 업무 코드가 처음 생긴다.
ADR 0001 과 루트 `AGENTS.md` 는 업무 로직을 `packages/<컨텍스트>` 에 두기로 했다(`packages/gold`, `packages/account`).
그런데 API 서버는 Node 가 TypeScript 파일을 그대로 돌린다.
이 방식으로는 `@nuno/*` 패키지를 import 하지 못한다(`ERR_UNSUPPORTED_DIR_IMPORT`).
골드 묶기와 풀기, 작업 상태 바꾸기 같은 규칙은 대부분 DB 함수(SECURITY DEFINER)에 있다.
앱은 골드 규칙을 직접 쓰지 않고 서버가 준 값을 그린다.

## 무엇을 정했나

1. 서버 업무 코드는 `apps/api/src/<컨텍스트>/` 에 둔다. 이번 T7 은 `account`, `gold`, `generation`, `lookbook` 이다.
2. 바깥 네트워크와 `pg` 같은 서버 SDK 는 지금처럼 `apps/api/src/adapters/` 에서만 부른다. 어댑터는 `src/composition/` 에서 만든다.
3. 상태를 바꾸는 규칙은 DB 함수에 두고, `nuno_api` 에는 함수 실행 권한만 하나씩 준다.
4. 루트 `AGENTS.md` 「무엇을 바꾸려면」 표의 골드와 가입 줄은 이 자리를 가리킨다.
5. 앱 쪽 업무 규칙(무대 단추 글자, 기기 저장 표)은 그대로 `packages/<컨텍스트>` 에 둔다.

## 왜 그렇게 정했나

- 서버가 패키지를 import 하려면 실행기나 빌드 단계가 새로 든다. 지금 규모에서 얻는 것보다 설정이 많다.
- 골드와 작업 규칙의 핵심은 DB 함수라서, TypeScript 쪽은 주소와 입력 검사 정도로 얇다.
- 앱이 쓰지 않는 규칙을 패키지로 나누면 공유할 상대가 없는 경계만 생긴다.
- 경계 검사(`sdk-only-in-adapters`, `adapters-only-in-composition`)는 `apps/api` 에도 그대로 걸린다.

## 버린 안

| 버린 안 | 버린 까닭 |
| --- | --- |
| `packages/gold`, `packages/account` 를 만들고 서버가 import | Node 가 패키지 import 를 풀지 못해 실행기나 빌드가 든다 |
| `tsx` 같은 TypeScript 실행기를 들임 | 새 의존성이고, 시험과 운영의 실행 방식이 갈린다 |
| 서버용 빌드 단계(tsc 출력)를 더함 | 빌드 산출물과 판 관리가 늘어난다. 지금은 빌드 없이 돈다 |

## 무엇을 잃나

- 서버 업무 코드에는 패키지 계층 검사(`pnpm check:packages`)와 도메인 린트가 걸리지 않는다.
- 앱과 서버가 같은 규칙을 쓰게 되면 그때 패키지로 옮기고 실행 방식을 다시 정해야 한다.
- 서버 컨텍스트끼리의 import 를 막는 규칙이 아직 없다. 같은 실수가 두 번 나오면 경계 규칙을 더한다.

## 이어지는 문서

- 계획과 설계 결정: `docs/plans/plan_T7.md`
- 앞선 구조 결정: `docs/adr/0001-monorepo-and-ddd-layers.md`
- 서버 규칙: `apps/api/AGENTS.md`

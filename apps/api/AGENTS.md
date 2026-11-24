# apps/api

Hono 로 만든 API 서버다. 워크스페이스 필터 이름은 `api` 다. 앱은 이 서버만 부르고 DB 에 직접 닿지 않는다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm test:db` (루트) | 로컬 Postgres 를 띄워 역할 설정, 판 옮기기, DB 시험, 덤프 복원 시험을 돈다 |
| `pnpm db:local` (루트) | 로컬 개발 DB(127.0.0.1:54329, nuno)를 띄우고 역할과 판을 적용한다 |
| `pnpm --filter api migrate` | `DATABASE_ADMIN_URL`(관리자) 로 판을 옮긴다. API 는 켜질 때 판을 옮기지 않는다 |
| `pnpm --filter api start` | `DATABASE_URL`(nuno_api) 로 서버를 띄운다. 포트는 `PORT`, 없으면 8787 |

## 규칙

- import 는 `.ts` 확장자를 붙인다. Node 가 TypeScript 를 그대로 돌리며 확장자 없는 경로를 풀지 못한다.
- `pg` 같은 서버 SDK 는 `src/adapters/` 에서만 import 한다. 경계 검사(`FEATURE_SDKS`)가 막는다.
- 서버 DB 판은 `db/migrations/<네 자리 번호>_<이름>.sql` 이다. main 에 머지된 판 파일은 고치지 않고 새 판을 더한다.
- 역할은 `db/setup.sql` 의 둘(`nuno_owner`, `nuno_api`)이다. 비밀번호는 이 파일에 넣지 않는다. `nuno_api` 에는 판에서 GRANT 로 필요한 만큼만 준다. 골드와 작업 상태는 DB 함수로만 바꾼다(T7).
- Postgres 확장과 호스팅 업체 전용 기능을 쓰지 않는다. `pg_dump` 로 옮길 수 있어야 한다.
- 실제 DB 시험은 `src/**/*.db.test.ts` 다. `pnpm test` 는 이 파일을 돌리지 않는다. 목으로 DB 를 대신하지 않는다.
- 공급사 시한(150초) 같은 시간은 vitest 가짜 타이머로 넘긴다. 이것은 목 금지(시험 규칙)에 걸리지 않는다.
- 의존성은 `pnpm --filter api add --save-exact <이름>@<판>` 으로, 나온 지 두 주 넘은 판을 들인다.
- DB 주소, 비밀번호, 공급사 키는 환경 변수로만 받는다. 로컬 값(docker-compose.yml, scripts/test-db.mjs) 말고는 저장소에 두지 않는다.

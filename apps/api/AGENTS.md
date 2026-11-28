# apps/api

Hono 로 만든 API 서버다. 워크스페이스 필터 이름은 `api` 다. 앱은 이 서버만 부르고 DB 에 직접 닿지 않는다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm test:db` (루트) | 로컬 Postgres 를 띄워 역할 설정, 판 옮기기, DB 시험, 덤프 복원 시험을 돈다 |
| `pnpm db:local` (루트) | 로컬 개발 DB(127.0.0.1:54329, nuno)를 띄우고 역할과 판을 적용한다 |
| `pnpm --filter api migrate` | `DATABASE_ADMIN_URL`(관리자) 로 판을 옮긴다. API 는 켜질 때 판을 옮기지 않는다 |
| `pnpm --filter api trial run <요청 목록.json> <호출 장부.csv> <채점 폴더> --provider fake` | 반증 실험 호출. 모델별 상한(`MODEL_CALL_CAPS`)에 닿으면 멈추고 종료 코드 2. `check`, `report` 는 plan_T6 참고 |
| `pnpm --filter api start` | `DATABASE_URL`(nuno_api) 로 서버를 띄운다. 포트는 `PORT`, 없으면 8787 |
| `pnpm --filter api worker` | 작업 worker 를 띄운다. API 와 같은 `DATABASE_URL`, 결과 폴더, 서명 키를 쓴다 |
| `pnpm api:dev` (루트) | 로컬 DB `nuno_dev` 에 판을 옮기고 개발 전용 주소를 켠 API 와 worker 를 8787 에 띄운다. e2e 는 같은 스크립트가 `nuno_e2e` 로 띄운다 |
| `node scripts/e2e-api.mjs [--dev] --only=api` 또는 `--only=worker` | API 나 worker 하나만 띄운다. 터미널 둘에서 하나씩 띄우면 한쪽만 내렸다 띄울 수 있다. DB 를 지우지 않는다 |
| `pnpm api:rds` (루트) | 개발 서버 DB(RDS Postgres 18, DB `nuno`)를 쓴다. 판 옮기기는 관리 계정 `nuno`, API 는 `nuno_api`. 접속 주소는 `NUNO_RDS_ENV`(기본 `~/.config/nuno/rds.env`)에서 읽는다. RDS 는 SSL 이 강제라 주소에 `sslmode` 를 붙인다 |

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
- 서버 업무 코드는 `src/<컨텍스트>/` 에 둔다(`account`, `gold` 등, ADR 0002). 바깥 네트워크와 `pg` 는 `src/adapters/` 에서만 부른다.

## 골드와 작업

- 골드 원장, 작업 상태, 결과 파일 상태는 판 0003 의 DB 함수로만 바뀐다. 함수는 맨 먼저 그 사용자의 `users` 행을 잠근다.
- 원장 표(`gold_entries`, `gold_transactions`)는 고치기와 지우기를 트리거가 막는다. 바로잡을 때는 새 거래를 더한다.
- worker 가 부르는 함수는 상태, 선점 토큰, 선점 기한이 맞아야 쓴다. 기한은 `LEASE_SECONDS` 다.
- 잠금 순서는 사용자 → 작업 → 시도 → 예산 행(날짜, 종류, 공급사 순)이다. 예산 행은 `nuno_budget_lock` 만 잠근다.
- 하루 예산은 판 0005 의 `cost_daily` 다. 지금은 하루 전체(`total`) 행만 예약하고 정산한다.
  - `nuno_start_attempt` 가 시도 줄을 만들기 전에 설정 줄의 `price_usd` 를 예약한다. 모자라면 `budget_exhausted` 다.
  - 시도가 끝나면 `nuno_finish_attempt` 가, worker 가 죽었으면 예약 작업이 `nuno_settle_next_budget` 를 시도마다 한 번씩 불러 정산한다.
  - 한 트랜잭션에서 예산 행을 쥔 채 다른 사용자 행을 잠그지 않는다. worker 와 교착이 생긴다.
  - 청구 여부나 청구액을 모르면 예약액을 그대로 둔다(`kept_reserved`). 다시 정산하지 않는다.
- 그날 행이 없으면 `cost_budget_defaults` 의 상한을 복사한다. 기본값이 없으면 상한 0원이라 공급사를 부르지 않는다.
  로컬 시험 DB 와 개발 DB 는 스크립트가 넣는다. 개발 서버와 운영 DB 는 운영자가 관리자로 넣는다.
- 작업은 접수 때 공급사 설정 줄 ID 와 판을 적는다. `nuno_start_attempt` 가 부르기 전마다 지금 줄과 비교한다.
  다르면 시도 줄 없이 `provider_changed` 나 `consent_outdated` 로 실패와 풀기다.
- 접수 상태로 `QUEUE_WAIT_SECONDS` 를 넘긴 작업은 공급사 호출 없이 `queue_timeout` 으로 끝난다. 자리는 둘이다.
  - 선점: worker 는 판 0006 의 네 인자 `nuno_claim_job` 만 부른다. 세 인자 판(판 0003)은 상한을 보지 않는다.
  - 예약 작업: `nuno_expire_next_queued_job` 을 한 번에 한 건씩, 행이 없을 때까지 되풀이한다.
- 저장하지 않은 결과(gen30)는 `delete_due_at` 이 지나면 조회가 주소를 주지 않고 저장이 404 다(정리 전에도).
  예약 작업 `expireResults` 가 파일을 먼저 지우고 `nuno_expire_result` 로 deleted 를 적는다. 저장한 결과는 고르지 않는다.
- 여러 사용자를 도는 정리는 한 건마다 트랜잭션 하나로 부른다. 한 트랜잭션이 여러 사용자 행을 잠그지 않는다.
- 결과 사진은 포트 `ResultStore` 다. 지금은 로컬 디스크와 `/v1/files` 서명 주소(기한 `RESULT_URL_TTL_SECONDS`)뿐이다.
  gen30 결과의 주소 기한은 보관 기한(`delete_due_at`)을 넘지 않는다(`signedUrl` 의 `notAfter`).
- 실제 공급사 어댑터는 입력 올리기와 입력 검사가 갖춰지기 전에는 worker 에 꽂지 않는다.
- worker 시험은 가장 오래된 접수 작업부터 선점한다. 그래서 `generation.db.test.ts` 는 다른 시험보다 이른 시각으로 접수한다.
  새 worker 시험은 2021~2029년에서 겹치지 않는 날짜를 맡는다. 선점이 그 시각으로 상한 지난 앞선 작업을 끝내고 지나간다.

## 로그인과 세션

- 세션 토큰은 32바이트 난수(base64url)이고 DB 에는 SHA-256 만 둔다. 만료는 `SESSION_DAYS`.
- 요청은 `Authorization: Bearer <토큰>` 이다. 사용자 ID 는 `requireUser` 가 세션에서만 붙이고, 요청 본문에서 받지 않는다.
- 동의 문구 판과 AI 업체 자료 보관 기간은 지금 쓰는 공급사 설정 줄(`nuno_current_provider_config`)에 있다.
  앱이 보낸 판이 그 줄의 판과 다르면 409 `consent_text_outdated`. `CONSENT_TEXT_VERSION` 은 열 기본값일 뿐이다.
- 판은 서버 설정 줄을 먼저 올리고, 새 문구를 담은 앱을 그 뒤에 내보낸다. 앱을 먼저 내면 최신 앱도 409 를 받는다.
- 설정 줄의 공급사, 모델, 나라, 보관 기간을 바꾸면 같은 줄의 `consent_text_version` 도 함께 올린다.
  판을 올리지 않은 UPDATE 는 판 0004 의 트리거가 거절한다. 판은 내리지 못하므로 되돌릴 때도 올린다.
  판을 올리지 않으려면 새 줄을 넣고 옛 줄을 끈다. 접수된 작업은 `provider_changed` 로 끝난다.
- 개발 전용 주소는 `/v1/dev` 아래에만 두고 `NUNO_DEV_ROUTES=1` 일 때만 단다. 값이 없으면 그 주소는 404 다.
- `POST /v1/dev/login` 의 신원 provider 는 코드 상수 `dev` 다. 요청에서 받지 않는다.

## 환경 변수

| 이름 | 쓰임 |
| --- | --- |
| `DATABASE_URL`, `PORT` | nuno_api 접속 주소, 서버 포트 |
| `NUNO_DEV_ROUTES` | `1` 이면 개발 전용 주소를 단다. 운영에서는 넣지 않는다 |
| `NUNO_WEB_ORIGINS` | CORS 로 받을 웹 출처(쉼표 목록). 없으면 CORS 머리글을 내지 않는다 |
| `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENC_KEY` | Apple 로그인. 하나라도 없으면 `/v1/auth/apple` 이 503 `apple_not_configured` |
| `NUNO_FILE_URL_SECRET` | 결과 사진 서명 주소 HMAC 키. 없으면 API 와 worker 가 시작하지 않는다 |
| `NUNO_RESULT_DIR` | 로컬 결과 사진 폴더. 없으면 `apps/api/.local-results` |
| `NUNO_PUBLIC_API_URL` | 서명 주소의 앞부분. 없으면 `http://localhost:<PORT>` |
| `NUNO_FAKE_RESULT_IMAGE` | 가짜 공급사가 결과로 줄 그림 파일. 없으면 1x1 흰 JPEG |

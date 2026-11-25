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
- 결과 사진은 포트 `ResultStore` 다. 지금은 로컬 디스크와 `/v1/files` 서명 주소(기한 `RESULT_URL_TTL_SECONDS`)뿐이다.
- 실제 공급사 어댑터는 입력 올리기와 입력 검사가 갖춰지기 전에는 worker 에 꽂지 않는다.
- worker 시험은 가장 오래된 접수 작업부터 선점한다. 그래서 `generation.db.test.ts` 는 다른 시험보다 이른 시각으로 접수한다.

## 로그인과 세션

- 세션 토큰은 32바이트 난수(base64url)이고 DB 에는 SHA-256 만 둔다. 만료는 `SESSION_DAYS`.
- 요청은 `Authorization: Bearer <토큰>` 이다. 사용자 ID 는 `requireUser` 가 세션에서만 붙이고, 요청 본문에서 받지 않는다.
- 동의 문구 판은 `CONSENT_TEXT_VERSION` 이다. 앱이 보낸 판이 다르면 409 `consent_text_outdated`.
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

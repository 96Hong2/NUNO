# T7 명령 판정 기록 (2026-11-25, 로컬 Docker Postgres 17, 개발 API 8787)

## D9: 「나가기」 전에 적은 결과 서명 주소

- 결과 화면에서 서명 주소(`/v1/files/gen30/<사용자 ID>/<작업 ID>-1.jpg?exp=…&sig=…`)를 적었다.
- 나가기 전 `curl` → 200.
- 「저장하지 않고 나갈까요?」 시트의 「나가기」 를 누른 뒤 같은 주소 `curl` → 404.

## D18: 운영 설정 API 의 시험용 로그인

- `NUNO_DEV_ROUTES` 없이 띄운 API(8899)
  - `POST /v1/dev/login` → 404
  - `POST /v1/dev/gold` → 404
  - `POST /v1/dev/provider` → 404
  - `GET /v1/health` → 200
- `NUNO_DEV_ROUTES=1` 로 띄운 개발 API(8787) 의 `POST /v1/dev/login` → 200.

## D17 시험 1: 생성 도중 worker 를 내리기

- 새 시험 계정으로 동의하고 가짜 공급사를 무응답(`hang`)으로 둔 뒤 무료 장 작업을 접수했다.
- 작업이 `generating` 이 된 것을 보고 개발 worker 프로세스를 `kill -9` 로 내렸다(20:43:59 UTC). API 도 함께 멈췄다.
- 그때 DB: 작업 `generating`, 선점 기한 20:46:44, 골드 묶음 `held`, 무료 장 1.
- 개발 API 와 worker 를 다시 띄웠다. 선점 기한 뒤 첫 예약 작업(20:47:15)이 작업을 `failed`(`lease_expired`)로 바꾸고 묶음을 `released` 로 풀었다.
- 그 뒤 「내 골드」: 무료 장 2, 골드 0. worker 기록 「예약 작업: 선점 기한이 지난 작업 1건을 실패와 풀기로 정리했다」.
- 늦게 온 결과가 상태와 골드를 바꾸지 못하는 것은 DB 시험 `generation.db.test.ts` 가 본다(같은 선점 토큰으로 기한 뒤 완료를 부르면 그대로).

## D34 서버 값: AI 업체 서버의 사진 보관 기간 응답 (2026-11-28, 판 4, 로컬 Docker Postgres 18)

- `node scripts/e2e-api.mjs` 로 새 `nuno_e2e` DB 에 판 4 를 옮기고 API 를 8987 에 띄웠다. 가짜 공급사 줄 하나를 켰다.
- 시험 계정으로 로그인하고 `GET /v1/consents/generation-transfer/retention` 을 불렀다.
  - 처음: `{"retentionDays":30}`(새 열의 기본값).
  - 관리자 psql 로 그 줄의 `retention_days` 를 7, `consent_text_version` 을 2 로 함께 올린 뒤: `{"retentionDays":7}`.
  - 같은 때 `GET /v1/consents/generation-transfer`: `{"currentVersion":2,"provider":"fake","country":"대한민국"}`.
  - 같은 때 옛 판 1 로 `POST /v1/consents`: 409 `{"error":"consent_text_outdated"}`.
  - 두 값을 30 과 1 로 되돌린 뒤: `{"retentionDays":30}`.
  - 토큰 없이 부르면 401 `{"error":"unauthorized"}`.
- 같은 흐름을 DB 시험 `apps/api/src/account/photo-retention.db.test.ts` 가 `pnpm test:db` 두 바퀴에서 본다.
- 화면 판정(설정 「사진 보관 안내」 시트)은 앱 묶음에서 한다.

## D20: 그날 생성 예산이 0원일 때 (2026-11-28, 판 5, 로컬 Docker Postgres 18)

- 터미널 둘에서 `node scripts/e2e-api.mjs --only=worker` 와 `--only=api` 로 `nuno_e2e` DB 에 판 5 를 옮기고 띄웠다(API 9087).
  - 스크립트가 넣은 하루 전체 예산 기본값은 1000달러다.
- 관리자 psql 로 오늘(한국 날짜 2026-11-28) `cost_daily` 의 `total` 행 `budget_usd` 를 0 으로 두었다.
- 무료 장으로 낸 경우: 새 시험 계정으로 동의하고 `POST /v1/generation-jobs` 를 불렀다. 접수 202, `paymentKind` `trial`.
  - 4초 뒤 작업 조회: `status` `failed`, `failureCode` `budget_exhausted`, `refund` 무료 장 4.
  - psql: 그 작업의 `generation_attempts` 0행(공급사 호출 기록 0건). 골드 묶음 `released`, 4.
  - 잔액: `trial` 8, `hold` 0. 예산 행은 예약 0, 확정 0 그대로. worker 로그 「작업 …: failed」 와 실패 푸시.
- 골드로 낸 경우: 시험용 골드 4 를 받고 `payWith` `gold` 로 접수했다. 접수 202, `paymentKind` `gold`.
  - 작업 조회: `failed`, `budget_exhausted`, `refund` 골드 4. 시도 0행, 골드 묶음 `released`.
  - 「내 골드」: 잔액 4. 내역은 「시험용 골드」 4, 「완성 룩 1장」 -4, 「완성 룩 환불」 4.
- 끝나고 오늘 행의 상한을 기본값 1000 으로 되돌렸다.
- 같은 흐름과 「상한을 한 장 값만 남기면 둘째 작업은 공급사를 부르지 않는다」 는 DB 시험 `budget.db.test.ts` 가 본다.

## D26: 예산 예약 뒤 worker 를 내리고 정산을 두 번 (2026-11-28, 판 5)

- DB 시험 `apps/api/src/generation/budget.db.test.ts` 의 셋째 시험이 `pnpm test:db` 두 바퀴(test-a, 덤프를 넣은 test-b)에서 통과했다.
- 시험 내용
  - 작업 셋을 선점하고 `nuno_start_attempt` 로 예약만 한다. 예약 합이 한 장 값(0.04달러)의 3배만큼 는다.
  - 관리자로 시도 A 는 청구 0.03달러, B 는 청구 없음으로 적고 C 는 모름으로 둔다.
  - 선점 기한 뒤 `nuno_sweep_jobs` 로 세 작업이 `lease_expired` 로 실패하고 무료 장이 돌아온다.
  - `nuno_settle_budgets` 첫 실행 뒤 예약 합은 A, B 몫(0.08달러)만 줄고 확정 합은 0.03달러 는다.
  - 둘째 실행 뒤 두 값이 그대로다. 시도 기록은 A `settled`, B `released`, C `kept_reserved`.
  - A 의 옛 선점 토큰으로 늦게 부른 `nuno_finish_attempt` 는 false 이고 예산 행과 A 청구액이 그대로다.
- 정산 함수의 「예약 상태인 시도만」 조건을 잠시 풀어 돌리면 이 시험이 실패했다. 조건을 되돌린 뒤 다시 통과했다.

## D30: 생성 도중 API 만 내렸다 다시 띄우기 (2026-11-28, 판 5)

- 터미널 1 `node scripts/e2e-api.mjs --only=worker`, 터미널 2 `--only=api`(9087). 같은 `nuno_e2e` DB 와 결과 폴더를 쓴다.
- 새 시험 계정의 가짜 공급사를 지연 10초로 두고 접수했다(07:18:45 UTC). 2초 뒤 작업은 `generating`.
- 07:18:48 터미널 2 의 API 만 SIGTERM 으로 내렸다. `GET /v1/health` 는 연결되지 않았고 worker 프로세스는 그대로 살아 있었다.
- API 가 내려간 동안 worker 로그: 「푸시(로그): … 작업 … succeeded」, 「작업 …: succeeded」(07:18:55). 작업 행 `succeeded`.
- 07:19:10 API 를 다시 띄웠다. 같은 생성 요청 ID 와 같은 본문으로 두 번 다시 접수했다.
  - 두 번 모두 202 와 처음 작업 ID, `status` `succeeded`.
  - psql: 그 요청 ID 의 `generation_jobs` 1행, 골드 묶음 1건(`captured`), 시도 1행(`completed`, `billed`, `settled`).

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

## D9: 「나가기」 뒤 작업을 다시 조회한 서명 주소 (2026-11-28, 기기 판 8, 로컬 Docker Postgres 18)

- 위 2026-11-25 절은 「나가기」 가 결과를 지우던 때의 기록이다. 지금 「나가기」 는 서버를 부르지 않는다.
- `node scripts/e2e-api.mjs` 로 새 `nuno_e2e` DB 에 API 를 9187 에, Expo 웹을 8591 에 띄웠다. 앱 브라우저 창 390x844.
- 시험 계정으로 동의하고 「무료로 만들기」 로 작업 `7cfab629-…` 결과를 받았다. 「뒤로」 → 「저장하지 않고 나갈까요?」 → 「나가기」.
- 무대 단추는 「이대로 입히기 무료 1장 남음」 이고 「다 된 완성 룩 보기」 는 없다(`d09-stage-after-leave.jpg`).
- 그 계정 토큰으로 `GET /v1/generation-jobs/<작업 ID>` → 200, `status: succeeded`, `result.url` 이 새 서명 주소(`/v1/files/gen30/…?exp=…&sig=…`).
- 그 주소를 `curl -o` → `HTTP 200 image/webp 20334바이트`. `file` 결과 `Web/P image, 900x1205`(가짜 공급사 결과 그림이 webp 다).
- 관리자 psql: `generation_results` 의 그 작업 줄 `storage_state = gen30`, `deleted_at` 빈 값, `delete_due_at` 은 접수 30일 뒤.
- 같은 주소로 결과 화면을 다시 열면 사진과 「입은 옷 6벌」 이 그대로 보인다(`d09-reopen-after-leave.jpg`). 콘솔 오류 없음.
- 같은 흐름을 `e2e/generate.spec.ts` 의 D9 시험이 본다.

## D20: 그날 생성 예산이 0원일 때 (2026-11-28, 판 5, 로컬 Docker Postgres 18)

### 화면 판정: 개발 DB `nuno_dev`, Expo 웹 코디 무대

- `node scripts/e2e-api.mjs --dev --only=worker` 로 `nuno_dev` 에 판 5 를 옮기고 worker 를 띄웠다.
  - 스크립트가 넣은 하루 전체 예산 기본값은 1000달러다.
- 다른 작업 트리가 8787 을 쓰고 있어 API 만 같은 환경 변수로 9087 에 띄웠다. DB 는 같은 `nuno_dev` 다.
- Expo 웹은 8491 에 `EXPO_PUBLIC_API_URL=http://localhost:9087` 로 띄웠다.
- 관리자 psql 로 오늘(한국 날짜 2026-11-28) `cost_daily` 의 `total` 행 `budget_usd` 를 0 으로 두었다.
- 새 기기에서 온보딩을 건너뛰고 피팅룸 코디 무대를 열었다. 처음 입혀 둔 코디 그대로 「이대로 입히기」 를 눌렀다.
  - 가입 시트의 「시험 계정으로 계속하기」 → 동의 화면의 「모두 동의하기」 → 「동의하고 만들기」.
  - 「완성 룩 만들기」 시트의 「무료로 만들기」 를 눌렀다.
- 완성 룩 화면에 「만들지 못했어요.」 와 「무료 1장을 돌려드렸어요」 가 보였다.
  - 그 아래 「돌려받은 무료 사진 +1장」 과 「같은 코디로 다시 만들기」 단추가 보였다.
  - 스크린숏: `d20-budget-exhausted-free.jpg`.
- psql: 그 작업 `failed`, `budget_exhausted`, `payment_kind` `trial`, `generation_attempts` 0행, 골드 묶음 `released` 4.
  - 잔액 `trial` 8, `hold` 0. 오늘 예산 행은 예약 0, 확정 0 그대로. worker 로그 「작업 …: failed」 와 실패 푸시.
- 끝나고 오늘 행의 상한을 기본값 1000 으로 되돌렸다.

### API 판정: e2e DB `nuno_e2e`

- 화면 판정 전에 `node scripts/e2e-api.mjs --only=worker` 와 `--only=api` 로 `nuno_e2e` 에서 같은 조건을 API 로 보았다.
- 무료 장으로 낸 경우: 새 시험 계정으로 동의하고 `POST /v1/generation-jobs` 를 불렀다. 접수 202, `paymentKind` `trial`.
  - 4초 뒤 작업 조회: `status` `failed`, `failureCode` `budget_exhausted`, `refund` 무료 장 4.
  - psql: 시도 0행, 골드 묶음 `released` 4. 잔액 `trial` 8, `hold` 0. 예산 행은 예약 0, 확정 0 그대로.
- 골드로 낸 경우: 시험용 골드 4 를 받고 `payWith` `gold` 로 접수했다. 접수 202, `paymentKind` `gold`.
  - 작업 조회: `failed`, `budget_exhausted`, `refund` 골드 4. 시도 0행, 골드 묶음 `released`.
  - 「내 골드」: 잔액 4. 내역은 「시험용 골드」 4, 「완성 룩 1장」 -4, 「완성 룩 환불」 4.
- 같은 흐름과 「상한을 한 장 값만 남기면 둘째 작업은 공급사를 부르지 않는다」 는 DB 시험 `budget.db.test.ts` 가 본다.

## D26: 예산 예약 뒤 worker 를 내리고 정산을 두 번 (2026-11-28, 판 5)

- DB 시험 `apps/api/src/generation/budget.db.test.ts` 의 셋째 시험이 `pnpm test:db` 두 바퀴(test-a, 덤프를 넣은 test-b)에서 통과했다.
- 시험 내용
  - 작업 셋을 선점하고 `nuno_start_attempt` 로 예약만 한다. 예약 합이 한 장 값(0.04달러)의 3배만큼 는다.
  - 관리자로 시도 A 는 청구 0.03달러, B 는 청구 없음으로 적고 C 는 모름으로 둔다.
  - 선점 기한 뒤 `nuno_sweep_jobs` 로 세 작업이 `lease_expired` 로 실패하고 무료 장이 돌아온다.
  - 정산(`settleBudgets`, 시도마다 `nuno_settle_next_budget`) 첫 실행 뒤 예약 합은 A, B 몫(0.08달러)만 줄고 확정 합은 0.03달러 는다.
  - 둘째 실행 뒤 두 값이 그대로다. 시도 기록은 A `settled`, B `released`, C `kept_reserved`.
  - A 의 옛 선점 토큰으로 늦게 부른 `nuno_finish_attempt` 는 false 이고 예산 행과 A 청구액이 그대로다.
- 정산 함수의 「예약 상태인 시도만」 조건을 잠시 풀어 돌리면 이 시험이 실패했다. 조건을 되돌린 뒤 다시 통과했다.

## D30: 생성 도중 API 만 내렸다 다시 띄우기 (2026-11-28, 판 5)

판 5 기준으로 먼저 해 둔 기록이다. 최종 판정은 아래 「D30: 판 6 worker 로 API 만 내렸다 다시 띄우기」 절이다.

- 터미널 1 `node scripts/e2e-api.mjs --only=worker`, 터미널 2 `--only=api`(9087). 같은 `nuno_e2e` DB 와 결과 폴더를 쓴다.
- 새 시험 계정의 가짜 공급사를 지연 10초로 두고 접수했다(07:18:45 UTC). 2초 뒤 작업은 `generating`.
- 07:18:48 터미널 2 의 API 만 SIGTERM 으로 내렸다. `GET /v1/health` 는 연결되지 않았고 worker 프로세스는 그대로 살아 있었다.
- API 가 내려간 동안 worker 로그: 「푸시(로그): … 작업 … succeeded」, 「작업 …: succeeded」(07:18:55). 작업 행 `succeeded`.
- 07:19:10 API 를 다시 띄웠다. 같은 생성 요청 ID 와 같은 본문으로 두 번 다시 접수했다.
  - 두 번 모두 202 와 처음 작업 ID, `status` `succeeded`.
  - psql: 그 요청 ID 의 `generation_jobs` 1행, 골드 묶음 1건(`captured`), 시도 1행(`completed`, `billed`, `settled`).

## D19, D22, D27, D28, D29 의 DB 시험 (2026-11-28, 판 6, 로컬 Docker Postgres 18)

- `COMPOSE_PROJECT_NAME=nuno_t7b1c NUNO_TEST_DB_PORT=55472 NUNO_TEST_RESTORE_PORT=55473 pnpm test:db`
  - 1/2 판을 옮긴 test-a: 시험 파일 10개, 시험 78개 통과(코드 리뷰 반영 뒤 다시 돌림).
  - 2/2 test-a 덤프를 넣은 test-b(판 6, 판 옮기기 없이): 시험 파일 10개, 시험 78개 통과.
- D19 `gold.db.test.ts` 「잔액이 4골드인 계정에서 서로 다른 요청 둘을 동시에 보내면 하나만 접수되고 잔액은 0 이다」
  - 무료 장을 다 쓴 계정에 시험용 골드 4 를 주고 다른 요청 ID 두 건을 함께 보낸다. 응답은 202 하나와 402 하나, 「내 골드」 잔액 0.
- D27 `queue-retention.db.test.ts` 「접수 뒤 대기 상한」 넷
  - `QUEUE_WAIT_SECONDS` 는 300초.
  - 골드 4 로 접수한 작업은 4분 59초에 대기 만료를 불러도 `queued` 다.
  - 5분 1초에 선점(`runNextJob`)을 한 번 부르면 그 작업은 `failed`, `queue_timeout`, 시도 0행, 묶음 `released`.
  - 무상 골드 4 와 묶음 0 으로 돌아오고, 실패 푸시가 한 번 간다. 조회는 `refund: { kind: "gold", amount: 4 }`.
  - 같은 선점에서 3분 20초 뒤 접수한 다른 계정 작업만 공급사로 가서 `succeeded`(가짜 공급사 호출 1번).
  - 다시 불러도 그 계정의 원장 거래와 기록 줄 수가 그대로다. 대기 만료와 네 인자 선점 모두 대기 상한 0초로 부르면 오류다.
  - 상한 지난 골드 작업 105건(대기 만료 한 바퀴 100번보다 많음)과 상한 안 작업 하나를 두고 대기 만료 없이 `runNextJob` 만 한 번 부른다.
    상한 안 작업만 `succeeded`(가짜 공급사 호출 1번). 105건은 모두 `queue_timeout`, 시도 0행, 묶음 `released`, 실패 푸시 105번, 골드 420 환급.
- D28 `queue-retention.db.test.ts` 「늦게 저장된 사진은 지워지고, 같은 사용자의 정상 결과 파일과 골드 원장은 바뀌지 않는다」
  - 같은 계정의 첫 작업을 `succeeded` 로 끝내 gen30 결과 행과 파일을 적어 둔다.
  - 둘째 작업은 worker 가 사진을 저장하는 도중에 시각을 선점 기한 너머로 돌리고 예약 작업(`sweepJobs`)을 먼저 돌린다.
  - worker 결과는 `lost`, 늦게 저장된 사진 파일은 지워짐, 작업 `failed` `lease_expired`, 결과 행 없음, 묶음 `released`.
  - 옛 선점 토큰으로 `nuno_job_checking` 은 NULL, `nuno_job_succeed` 는 false.
  - 예약 작업 직후와 끝의 원장 거래 수와 기록 줄 수가 같다. 첫 작업의 결과 행과 파일 바이트가 그대로다. 푸시는 예약 작업의 실패 한 번뿐.
- D29 `queue-retention.db.test.ts` 「기한이 지나면 조회가 주소를 주지 않고 저장을 거절하며, 정리 뒤에는 파일이 열리지 않고 DB 도 삭제 상태다」
  - 결과 둘 가운데 하나만 「내 룩북에 저장」 했다. 저장하지 않은 결과의 `delete_due_at` 은 완료 시각 + 30일.
  - 30일 1초 전: 조회가 주소를 주고 그 주소가 200. 그 주소의 `expiresAt` 은 10분 뒤가 아니라 보관 기한이다.
  - 30일 1초 뒤, 정리 전: 파일이 남아 있어도 30일 1초 전에 받은 그 주소는 403.
  - 30일 1초 뒤, 정리 전: 조회 `result` null, 저장 404, 저장 자리 복사본 없음, `nuno_keep_result` 직접 호출도 NULL, DB 는 아직 gen30.
  - 정리(`expireResults`) 뒤: `storage_state = 'deleted'`, `deleted_at` 이 정리 시각, 파일 없음, 그 시각으로 새로 서명한 주소 404, 저장 404, 룩 0행.
  - 저장한 결과는 행이 그대로이고 새로 서명한 `u/…` 주소가 200.
- D22 `keep-again.db.test.ts` 「룩북에 룩이 1개 생기고, 그 룩의 사진이 열리며, gen30 파일은 지워진다」
  - 끝난 결과 파일을 `u/<사용자>/looks/<결과 ID>.jpg` 로 `store.copy` 만 해 둔다(복사 직후 중단). DB 는 gen30 그대로.
  - 다시 저장하면 200 과 룩 ID. 결과 행은 `kept` 와 저장 자리 키, gen30 파일 없음.
  - `GET /v1/looks` 는 그 룩 하나이고, 받은 `imageUrl` 이 200 에 원래 바이트다. 한 번 더 저장하면 같은 룩 ID, 룩 1행.
- 일부러 깨뜨려 확인: 조회, `keep-result.ts`, `nuno_keep_result` 의 기한 확인 셋을 빼고 돌리면 D29 시험이 실패한다
  (`expected { …(6) } to match object { status: 'succeeded', result: null }`). 되돌린 뒤 두 바퀴 모두 통과.
- 일부러 깨뜨려 확인: worker 가 세 인자 선점(대기 상한을 보지 않음)을 부르게 되돌리면 105건 시험이 실패한다.
  `runNextJob` 이 상한 안 작업이 아닌 상한 지난 작업을 선점했다. 되돌린 뒤 두 바퀴 모두 78개 통과.

## 명령 판정 환경 (2026-11-28, 판 6)

- 로컬 Docker Postgres 18, `COMPOSE_PROJECT_NAME=nuno_t7b1c`, `NUNO_DB_PORT=55471`, DB `nuno_e2e`, 결과 폴더 `apps/api/.local-results/e2e`.
- 터미널 1 `node scripts/e2e-api.mjs --only=api`(`NUNO_E2E_API_PORT=9287`), 터미널 2 `node scripts/e2e-api.mjs --only=worker`.
- `--dev` 는 API 포트가 8787 로 정해져 있는데 다른 세션의 개발 API 가 8787 을 쓰고 있어 e2e 모드로 했다. `--only` 는 두 모드 모두 DB 를 지우지 않는다.
- 시각은 모두 UTC. 시험 계정은 `POST /v1/dev/login` 의 새 subject 로 만들고 동의한 뒤 접수했다.

## D27: worker 가 내려간 동안 대기 상한 5분을 넘긴 작업

- API 만 띄우고 worker 는 띄우지 않았다.
- 07:45:05 계정 A 무료 장 작업 접수(202, `queued`, 묶음 `held` 4). 07:45:21 계정 B 무료 장 작업 접수.
- 07:47:41 계정 C 무료 장 작업 접수(worker 를 띄울 때 아직 5분 안).
- 07:50:35 무렵 worker 만 띄웠다. worker 로그:
  - 「푸시(로그): … 작업 38aa05a3… failed」, 「… 작업 9093f4ce… failed」, 「예약 작업: 대기 상한을 넘긴 접수 작업 2건을 끝냈다」
  - 「작업 28151206…: succeeded」
- psql(관리자):

| 작업 | 접수 | 끝남 | 상태 | 실패 코드 | 묶음 | 시도 행 |
| --- | --- | --- | --- | --- | --- | --- |
| A | 07:45:05 | 07:50:39 | failed | queue_timeout | released | 0 |
| B | 07:45:21 | 07:50:39 | failed | queue_timeout | released | 0 |
| C | 07:47:41 | 07:50:40 | succeeded | | captured | 1 |

- 계정 A 의 `GET /v1/generation-jobs/<A>`: `status` `failed`, `failureCode` `queue_timeout`, `result` null, `refund` `{"kind":"trial","amount":4}`.
- 계정 A 의 `GET /v1/gold`: `trialCount` 2(무료 장이 돌아옴), `balance` 0.

## D29: 저장하지 않은 결과의 보관 기한이 지난 뒤

- 계정 하나로 결과 둘(작업 1, 2)을 받고 작업 2 만 「내 룩북에 저장」(200). 작업 1 은 gen30, `delete_due_at` 이 30일 뒤(2026-12-28 07:51:01).
- 작업 1 을 조회해 받은 서명 주소 `curl` → 200 `image/webp`.
- 관리자 psql 로 작업 1 결과의 `delete_due_at` 을 `now() - 1초`(07:51:10)로 옮겼다. 30일이 지난 상태를 만든 것이다.
- 정리 전(07:51:11):
  - 조회 `{"status":"succeeded", …, "result":null}`.
  - 저장 `POST /v1/generation-jobs/<작업 1>/keep` → 404 `{"error":"not_found"}`.
  - DB 는 아직 gen30. 앞서 받은 10분짜리 주소는 파일이 남아 있어 200.
    이 주소는 보관 기한을 옮기기 전에 받아 기한이 10분 뒤였다. 기한 직전에 받은 주소는 아래 「D29 다시 판정」 에서 본다.
- 07:51:39 worker 예약 작업: 「예약 작업: 보관 기한이 지난 결과 1건을 지웠다」.
- 정리 뒤:
  - DB `storage_state` `deleted`, `deleted_at` 07:51:39. 결과 폴더 `gen30/<사용자 ID>/` 가 비었다.
  - 앞서 받은 주소 `curl` → 404. 저장 → 404. 조회 `result` null.
  - 저장한 작업 2 는 `kept`, `delete_due_at` 빈 값. `GET /v1/looks` 의 룩 1개, 그 `imageUrl` → 200.

## D29 다시 판정: 보관 기한 직전에 받은 주소 (2026-11-28, 코드 리뷰 반영 뒤)

- 위 「명령 판정 환경」 과 같은 Docker Postgres 18, `COMPOSE_PROJECT_NAME=nuno_t7b1c`, `NUNO_DB_PORT=55471`.
- `node scripts/e2e-api.mjs`(`NUNO_E2E_API_PORT=9287`)로 `nuno_e2e` 를 새로 만들고 API 와 worker 를 함께 띄웠다.
  - 관리자 psql 로 `nuno_claim_job` 이 세 인자 판과 네 인자 판 둘인 것을 봤다.
- 새 계정으로 무료 장 작업을 접수했다(08:05:06, 작업 8a0c2ca5…). worker 가 `succeeded` 로 끝냈다.
- 관리자 psql 로 그 결과의 `delete_due_at` 을 지금 + 20초(08:05:27)로 옮겼다. 30일이 거의 다 지난 상태다.
- 08:05:07 조회: `result.expiresAt` 은 `2026-11-28T08:05:27.000Z`(보관 기한). 그 주소 → 200.
- 08:05:29 보관 기한 2초 뒤, 정리 전:
  - DB `storage_state` 는 아직 gen30. 08:05:34 에도 결과 폴더에 그 파일이 있었다.
  - 08:05:07 에 받은 주소 → 403. 조회 `result` null.
- 판정에 쓴 시나리오 스크립트는 저장소에 두지 않았다. 차례는 위 줄 그대로다.

## D22: 보관 자리로 복사한 직후 서버를 내린 뒤 다시 저장

- 새 계정으로 결과 하나를 받았다(gen30).
- 저장 함수가 복사만 하고 내려간 상태를 만들려고 결과 폴더에서 gen30 파일을 `u/<사용자 ID>/looks/<결과 ID>.jpg` 로 `cp` 했다.
  - 그때 gen30 파일과 보관 자리 파일이 함께 있고, DB 는 gen30 이다.
- 이어서 아래 D30 에서 API 를 내렸다가 다시 띄웠다(07:52:16 내림, 07:52:45 다시 뜸).
- 다시 띄운 API 로 저장 → 200 `{"lookId":"0224fdd2…"}`. 한 번 더 저장 → 같은 룩 ID.
- DB: 결과 `kept`, 키 `u/<사용자 ID>/looks/<결과 ID>.jpg`. 그 계정의 `looks` 1행.
- 결과 폴더: gen30 파일 없음, 보관 자리 파일 하나.
- `GET /v1/looks`: 룩 1개, `imageUrl` `curl` → 200 `image/webp`.

## D30: 판 6 worker 로 API 만 내렸다 다시 띄우기

- 판 6 worker(1초마다 대기 만료 다음 선점)와 API 를 위 환경의 터미널 둘로 따로 띄웠다.
- 새 계정의 가짜 공급사를 지연 15초로 두고 무료 장 작업을 접수했다(07:52:14, 작업 790164c7…). 2초 뒤 `generating`, 선점 기한 07:55:15.
- 07:52:16 API 의 `e2e-api.mjs --only=api` 만 SIGTERM 으로 내렸다.
  - `GET /v1/health` 는 연결되지 않았다(000). worker 의 `e2e-api.mjs --only=worker` 와 `worker.ts` 프로세스는 그대로 살아 있었다.
- API 가 내려간 동안 worker 로그(07:52:31 전): 「푸시(로그): … 작업 790164c7… succeeded」, 「작업 790164c7…: succeeded」. 작업 행 `succeeded`.
- 07:52:45 API 를 다시 띄웠다. `GET /v1/health` → `{"ok":true,"schemaVersion":6}`.
- 같은 생성 요청 ID 와 같은 본문으로 두 번 다시 접수했다. 두 번 모두 202 와 처음 작업 ID, `status` `succeeded`.
- psql: 그 요청 ID 의 `generation_jobs` 1행, 골드 묶음 1건(`captured`), 시도 1행(`completed`, `billed`, `settled`).
- 첫 시도(07:51:56 접수)는 API 를 내리는 명령이 pid 를 잘못 잡아 내리지 못했다. 그 작업은 그대로 `succeeded` 로 끝났고 판정에 쓰지 않았다.

## D21: 옷 사진 올리기와 입력 검사 (2026-11-28, 판 7)

- 로컬 Docker Postgres 18, `COMPOSE_PROJECT_NAME=nuno-d21`, `NUNO_DB_PORT=54519`, DB `nuno_e2e`.
- API 와 worker 는 `node scripts/e2e-api.mjs`(`NUNO_E2E_API_PORT=8971`)로 함께 띄웠다. 가짜 공급사다.
- 계정 A, B 는 `POST /v1/dev/login` 의 새 subject 로 만들고 동의했다. 줄 수는 관리자 `psql` 로 셌다.
- 「바꿔치기」 는 확정한 `job-in/` 파일을 디스크에서 다른 바이트로 덮어쓴 것이다.

```
## 1. 계정 A 가 올린 ID 를 계정 B 가 쓴다
A 발급: 08b8e788-f0a6-479c-9d0b-9888e71551d5
A 가 ok.png 를 올림: 200 
B 가 A 의 ID 로 접수: {"error":"invalid_upload"} 422
B 의 작업 줄 수: 0
B 가 A 의 확정 전 ID(272eb57a-755f-4793-a770-a44e5955447b)에 올림: 404 
그 줄 상태: issued

## 2. 크기와 형식
8MiB+1 바이트: 413 
글자 파일: 415 
끝이 잘린 PNG: 415 
그 줄 상태와 파일 키: issued,없음
그 ID 로 접수: {"error":"invalid_upload"} 422
A 의 작업 줄 수: 0

## 3. 확정 뒤 파일을 바꿔치기하면 공급사에 보내지 않는다
올림: 200 
바꾼 파일: job-in/c91a7549-de32-43d8-91e8-9e68b4430151/d0a31fa5-1420-415e-b5fe-d08bad458134/c414cd0e204de974f73753c7e28d7638e7b3691bb8b1a2bab6b25bb7fed7ce77.png
접수: {"jobId":"7950cd39-77b5-45f1-a585-8e59c948137a","status":"queued","paymentKind":"trial"} 202
작업 상태와 실패 코드: failed,input_invalid
시도 줄 수(공급사 호출): 0
묶음 상태: released

## 4. 바꾸지 않은 파일은 공급사에 간다
접수: {"jobId":"a51f97b9-9292-4f75-8f82-26f524379002","status":"queued","paymentKind":"trial"} 202
작업 상태: succeeded,
시도 줄 수: 1
```

- DB 시험 `apps/api/src/generation/upload.db.test.ts` 8건은 `pnpm test:db` 두 바퀴(새 DB, 덤프 복원 DB)에서 통과했다. 전체 86건 통과.

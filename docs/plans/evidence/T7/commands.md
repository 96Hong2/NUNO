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

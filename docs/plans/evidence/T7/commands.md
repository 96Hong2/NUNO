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

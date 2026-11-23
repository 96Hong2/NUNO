# apps/mobile

Expo SDK 58 과 Expo Router 앱이다. 워크스페이스 필터 이름은 `mobile` 이다.

## 화면과 라우트

- 라우트 파일은 `app/` 에 둔다. 경로 이름은 `GLOSSARY.md` 의 코드 이름(`home`, `fitting/coordi` 등)이다.
- 하단 탭은 `app/(tabs)/_layout.tsx` 의 「홈」, 「피팅룸」, 「마이」 셋이다. 탭을 더하려면 먼저 묻는다.
- 피팅룸 네 칸은 `app/(tabs)/fitting/_layout.tsx` 의 `CELLS` 와 같은 폴더 라우트 파일이다.
- 화면 글자와 단추 이름은 `GLOSSARY.md` 화면 이름을 그대로 쓴다. 새 이름은 그 표에 먼저 더한다.
- 개발용 화면은 `app/dev/` 에 두고 `__DEV__` 가 아니면 열지 않는다. 「마이」 의 「저장소 보기」 줄도 같다.
- 여러 화면이 쓰는 화면 부품은 `src/ui/` 에 둔다. 업무 규칙은 두지 않는다.
- `Link asChild` 의 자식에 스타일 배열을 넘기면 Expo Router 가 던진다. `StyleSheet.flatten` 으로 넘긴다.

## 어댑터와 composition

- 기기나 서버 SDK(`FEATURE_SDKS`)는 `src/adapters/` 에서만 import 한다. 경계 검사가 막는다.
- 화면은 화면 틀(react-native, expo-router 등), `src/ui`, `src/composition`, `@nuno/*` 공개 면을 import 한다.
- 화면은 `src/adapters` 와 기능 SDK 를 import 하지 않는다. composition 이 어댑터로 연 함수를 화면이 불러 쓴다.
- composition 은 연결을 열고 유스케이스에 포트를 꽂는 일만 한다. 컨텍스트마다 `composition/<컨텍스트>.ts` 하나를 둔다.
- 컨텍스트 표의 SQL 과 옮기기 단계는 그 패키지 application 에 둔다. `dev-storage.ts` 는 개발용 예외다.
- 기기 DB 는 `src/composition/device-db.ts` 의 연결 하나를 나눠 쓴다. 판 순서는 T2-1 의 `migrations.ts` 한 곳이다.
- expo-sqlite 는 비동기 API 만 쓴다. 웹의 sync API 는 교차 출처 격리 문서에서만 돌고, 개발 서버 `/` 는 격리가 안 된다.
- 웹은 배타 트랜잭션이 없다. 어댑터는 `withTransactionAsync` 를 연결 하나의 줄 세우기 안에서 부른다.
- 의존성은 `pnpm --filter mobile exec expo install <이름>` 으로만 들이고 `expo install --check` 로 맞춘다.

## 웹 확인

- `pnpm web` 이 http://localhost:8090 에 Metro 웹 서버를 띄운다. 브라우저는 저절로 열리지 않는다.
- Claude 브라우저 창은 `.claude/launch.json` 의 `mobile-web` 으로 연다. 기기 DB(OPFS)는 localhost 에서만 저장된다.
- 같은 DB 를 탭 둘이 열면 잠긴다. 「저장소 보기」 는 탭 하나에서만 본다.
- `pnpm e2e` 는 8091(`NUNO_E2E_PORT`)에 이 체크아웃의 서버를 따로 띄운다. 떠 있는 서버를 다시 쓰지 않는다.
- worktree 둘에서 e2e 를 함께 돌리면 `NUNO_E2E_PORT` 를 서로 다르게 준다. 시험은 루트 `e2e/*.spec.ts` 다.
- 지나간 탭 화면은 inert 로 뒤에 남는다. e2e 에서 머리글은 `h1:not([inert] *)` 로 찾는다.

## iOS

- 이 Mac 에는 Xcode 가 없다. iOS 시뮬레이터 확인(D20)은 Xcode 를 설치한 뒤에 한다.

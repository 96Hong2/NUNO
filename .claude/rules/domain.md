---
paths:
  - "packages/*/src/domain/**"
  - "packages/*/src/application/**"
---

# 도메인과 application 계층

- domain 에는 순수 타입과 함수만 둔다. DB, 화면, 네트워크, 시각, 난수를 부르지 않는다.
- 시각은 `Clock` 값을 인자로 받는다. 한국 날짜는 `@nuno/clock` 의 `toKstDateString` 으로 계산한다.
- 날짜 고르기로 받은 달력 날짜(생년월일 등)는 `YYYY-MM-DD` 그대로 저장한다. 시각으로 바꾸지 않는다.
- 도메인은 ID 를 문자열 값으로 받는다. `IdGenerator` 는 application 에서 부른다.
- domain 은 같은 패키지 domain 과 `@nuno/clock` 공개 면만 import 한다. 경계 검사가 막는다.
- 타입과 함수 이름은 `GLOSSARY.md` 의 코드 이름을 쓴다. 없는 이름이면 그 표에 먼저 더한다.
- 업무 규칙의 시험은 같은 폴더 `*.test.ts` 에 둔다. 시계와 ID 대역은 `@nuno/<패키지>/testing` 에서 가져온다.
- application 에는 유스케이스 함수와 포트(바깥에 맡길 일의 타입)를 둔다.
- 바깥 SDK 포트 구현은 `apps/mobile/src/adapters` 에 둔다.
- 다른 컨텍스트 공개 면으로 만드는 포트 구현은 `apps/mobile/src/composition` 에 둔다.
- application 은 같은 패키지 domain, application 과 공유 패키지 공개 면만 import 한다.
- 공유 패키지는 `@nuno/clock`, `@nuno/ids`, `@nuno/device-db` 셋이다. 다른 컨텍스트가 필요하면 포트를 선언한다.
- 계층은 domain 과 application 둘뿐이다. `src` 에 다른 폴더를 만들지 않는다.
- 동적 `import()` 는 쓰지 않는다. 경계 검사가 보지 못해 린트가 막는다.
- 쓰는 `@nuno/*` 는 `package.json` dependencies 에 `"workspace:*"` 로 적는다.
- 밖에서 쓸 이름은 `src/index.ts` 에 `export { 이름 }` 으로 하나씩 더한다.

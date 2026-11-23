---
paths:
  - "packages/*/src/domain/**"
  - "packages/*/src/application/**"
---

# 도메인과 application 계층

- domain 에는 순수 타입과 함수만 둔다. DB, 화면, 네트워크, 시각, 난수를 부르지 않는다.
- 시각은 `Clock`, ID 는 `IdGenerator` 값을 인자로 받는다. 한국 날짜는 `@nuno/clock` 의 `toKstDateString` 으로 계산한다.
- domain 은 같은 패키지 domain 과 `@nuno/clock` 공개 면만 import 한다. 경계 검사가 막는다.
- 타입과 함수 이름은 `GLOSSARY.md` 의 코드 이름을 쓴다. 없는 이름이면 그 표에 먼저 더한다.
- 업무 규칙의 시험은 같은 폴더 `*.test.ts` 에 둔다. 시계와 ID 대역은 `@nuno/<패키지>/testing` 에서 가져온다.
- application 에는 유스케이스 함수와 포트(바깥에 맡길 일의 타입)를 둔다. 포트 구현은 `apps/mobile/src/adapters` 에 둔다.
- application 은 같은 패키지와 `@nuno/clock`, `@nuno/ids`, `@nuno/device-db` 공개 면만 import 한다. 다른 컨텍스트가 필요하면 포트를 선언한다.
- 밖에서 쓸 이름은 `src/index.ts` 에 `export { 이름 }` 으로 하나씩 더한다.

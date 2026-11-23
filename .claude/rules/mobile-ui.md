---
paths:
  - "apps/mobile/**"
---

# 모바일 앱 화면

- 화면 글자와 버튼 이름은 `GLOSSARY.md` 의 화면 이름을 그대로 쓴다.
- 화면은 `@nuno/<이름>` 공개 면만 import 한다. 패키지의 `src/domain` 안쪽 경로를 쓰지 않는다.
- 기기나 서버를 부르는 SDK 는 `src/adapters/` 에서만 import 한다. 저장, 파일, 카메라, 알림, 결제, 인증 SDK 가 그렇다.
- 그런 SDK 를 새로 들이면 `.dependency-cruiser.cjs` 의 `FEATURE_SDKS` 에 더한다. 빠지면 경계 검사가 막지 못한다.
- 화면 부품(날짜 고르기, 그림 보기 등)은 화면에서 바로 쓴다.
- 어댑터는 `src/composition/` 에서 만들어 화면에 넘긴다.
- 업무 규칙을 화면 컴포넌트에 쓰지 않는다. 그 컨텍스트의 domain 이나 application 에 두고 불러 쓴다.
- 앱 의존성은 `expo install` 로만 들여 Expo 판과 맞춘다.
- 개발용 화면(「저장소 보기」 등)은 개발 빌드에서만 연다.
- 화면을 바꾸면 Claude 브라우저 창에서 사용자처럼 눌러 보고, 콘솔 오류가 없는지 본다.

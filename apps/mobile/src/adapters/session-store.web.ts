import type { SessionStore } from "./session-store";

// 웹: 서버 세션 토큰을 localStorage 에 둔다. 웹 빌드는 개발과 시험에만 쓴다.

const TOKEN_KEY = "nuno.session-token";
/** 시험 로그인 subject. 브라우저마다 한 번 만들고 로그아웃해도 남겨 같은 사용자로 다시 들어온다 */
const DEV_SUBJECT_KEY = "nuno.dev-subject";

export type { SessionStore };

export const sessionStore: SessionStore = {
  read: () => Promise.resolve(localStorage.getItem(TOKEN_KEY)),
  write: (token) => Promise.resolve(localStorage.setItem(TOKEN_KEY, token)),
  clear: () => Promise.resolve(localStorage.removeItem(TOKEN_KEY)),
  devSubject() {
    let subject = localStorage.getItem(DEV_SUBJECT_KEY);
    if (!subject) {
      subject = `web-${crypto.randomUUID()}`;
      localStorage.setItem(DEV_SUBJECT_KEY, subject);
    }
    return subject;
  },
};

import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

// 서버 세션 토큰을 기기 보안 저장소(iOS 키체인, 안드로이드 키스토어)에 둔다. 웹은 session-store.web.ts 다.

const TOKEN_KEY = "nuno.session-token";

export interface SessionStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
  /** 시험 로그인 subject. 웹 개발 빌드에서만 있고 기기에서는 null 이다 */
  devSubject(): string | null;
}

export const sessionStore: SessionStore = {
  read: () => getItemAsync(TOKEN_KEY),
  write: (token) => setItemAsync(TOKEN_KEY, token),
  clear: () => deleteItemAsync(TOKEN_KEY),
  devSubject: () => null,
};

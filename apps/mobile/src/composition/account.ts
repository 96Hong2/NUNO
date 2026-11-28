import { CONSENT_TEXT_VERSION, deleteAllGenerationRequests } from "@nuno/generation";
import { Platform } from "react-native";
import { apiRequest, hasApiServer } from "../adapters/api-client";
import { sessionStore } from "../adapters/session-store";
import { getDeviceDb } from "./device-db";

// 서버 계정: 로그인과 로그아웃, 나(me), 동의, 골드 요약. 세션 토큰은 어댑터가 기기 보안 저장소에 둔다.
// 화면은 서버 값을 들고 있다가 onAccountChange 로 다시 읽는다(로그아웃하면 비운다).

const CONSENT_KIND = "generation_transfer";

export interface ConsentState {
  agreed: boolean;
  /** 철회하지 않은 마지막 동의의 문구 판. 동의한 적이 없으면 null */
  textVersion: number | null;
  currentVersion: number;
}

export interface GoldEntry {
  at: string;
  label: string;
  amount: number;
}

export interface GoldSummary {
  trialCount: number;
  /** 무료 장이 남았고 오늘 무료 접수가 하루 한도 아래다. 거짓이면 무대 단추가 골드 흐름으로 간다 */
  trialUsableToday: boolean;
  balance: number;
  entries: GoldEntry[];
}

export interface AccountState {
  /** 빌드에 서버 주소가 있다 */
  server: boolean;
  /** 서버 주소가 있고 generate_look 스위치가 켜져 있다 */
  generateOn: boolean;
  signedIn: boolean;
  consent: ConsentState | null;
  gold: GoldSummary | null;
}

const SIGNED_OUT: AccountState = {
  server: false,
  generateOn: false,
  signedIn: false,
  consent: null,
  gold: null,
};

const listeners = new Set<() => void>();

export function onAccountChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function accountChanged(): void {
  for (const listener of listeners) listener();
}

/** 세션 토큰. 없으면 가입 전이다. */
export function sessionToken(): Promise<string | null> {
  return sessionStore.read().catch(() => null);
}

/** 서버가 토큰을 받지 않으면(만료, 철회) 기기 토큰을 지워 가입 전으로 돌린다. */
export async function forgetSession(): Promise<void> {
  await sessionStore.clear().catch(() => undefined);
  accountChanged();
}

async function generateSwitchOn(): Promise<boolean> {
  const result = await apiRequest<{ switches: { key: string; enabled: boolean }[] }>(
    "/v1/feature-switches",
  );
  return (
    result.ok && result.data.switches.some((row) => row.key === "generate_look" && row.enabled)
  );
}

/** 「이대로 입히기」 로 룩을 만들어 룩북에 저장할 수 있는지. 무대 단추를 보이는 조건과 같다 */
export async function canGenerateLooks(): Promise<boolean> {
  return hasApiServer() && (await generateSwitchOn());
}

/** 무대 단추, 마이, 설정이 쓰는 계정 값. 서버가 없으면 모두 빈 값이다. */
export async function loadAccount(): Promise<AccountState> {
  if (!hasApiServer()) return SIGNED_OUT;
  const token = await sessionToken();
  const switchOn = generateSwitchOn();
  if (!token) return { ...SIGNED_OUT, server: true, generateOn: await switchOn };
  const [me, gold, generateOn] = await Promise.all([
    apiRequest<{ consent: ConsentState }>("/v1/me", { token }),
    apiRequest<GoldSummary>("/v1/gold", { token }),
    switchOn,
  ]);
  if (!me.ok && me.status === 401) {
    await forgetSession();
    return { ...SIGNED_OUT, server: true, generateOn };
  }
  return {
    server: true,
    generateOn,
    signedIn: true,
    consent: me.ok ? me.data.consent : null,
    gold: gold.ok ? gold.data : null,
  };
}

/** 가입 시트 「시험 계정으로 계속하기」 를 보일지. 웹 개발 빌드에서만 보인다 */
export function canDevSignIn(): boolean {
  return __DEV__ && Platform.OS === "web" && hasApiServer();
}

/** 시험 계정으로 로그인한다. subject 는 브라우저마다 하나라 같은 브라우저는 같은 사용자다. */
export async function devSignIn(): Promise<boolean> {
  const subject = sessionStore.devSubject();
  if (!canDevSignIn() || !subject) return false;
  const result = await apiRequest<{ token: string }>("/v1/dev/login", {
    method: "POST",
    body: { subject },
  });
  if (!result.ok) return false;
  await sessionStore.write(result.data.token);
  accountChanged();
  return true;
}

/**
 * 로그아웃: 서버 세션을 끊고, 기기 토큰과 생성 요청을 지운 뒤 화면이 들고 있던 서버 값을 비우게 한다.
 * 옷장, 「내 코디」, 견본 룩은 기기에 그대로 둔다. 서버에 닿지 못해도 기기 쪽은 로그아웃한다.
 * 기기 토큰이나 요청 줄을 지우지 못하면 false 다.
 */
export async function signOut(): Promise<boolean> {
  const token = await sessionToken();
  if (token) await apiRequest("/v1/auth/sign-out", { method: "POST", token });
  try {
    await sessionStore.clear();
    const { db } = await getDeviceDb();
    await deleteAllGenerationRequests(db);
  } catch {
    return false;
  }
  accountChanged();
  return true;
}

export interface ConsentProvider {
  provider: string | null;
  country: string | null;
  /** AI 업체 서버가 받은 자료를 두는 날 수. 켜 둔 공급사 줄이 없으면 null */
  retentionDays: number | null;
}

/** AI 업체 서버의 자료 보관 기간(날 수). 서버가 켜 둔 공급사 줄 값이고, 못 읽으면 null */
export async function loadPhotoRetention(): Promise<number | null> {
  const token = await sessionToken();
  if (!token) return null;
  const result = await apiRequest<{ retentionDays: number | null }>(
    "/v1/consents/generation-transfer/retention",
    { token },
  );
  return result.ok ? result.data.retentionDays : null;
}

/** 동의 화면의 받는 곳과 보관 기간. 서버가 켜 둔 공급사 줄에서 읽는다 */
export async function loadConsentProvider(): Promise<ConsentProvider | null> {
  const token = await sessionToken();
  if (!token) return null;
  const [result, retentionDays] = await Promise.all([
    apiRequest<{ provider: string | null; country: string | null }>(
      "/v1/consents/generation-transfer",
      { token },
    ),
    loadPhotoRetention(),
  ]);
  if (!result.ok) return null;
  return { provider: result.data.provider, country: result.data.country, retentionDays };
}

export type ConsentResult = "agreed" | "outdated" | "unavailable" | "failed";

/** 「동의하고 만들기」: 앱 문구의 판으로 동의한다. 서버 판과 다르면 outdated, 켜 둔 공급사가 없으면 unavailable */
export async function agreeConsent(): Promise<ConsentResult> {
  const token = await sessionToken();
  if (!token) return "failed";
  const result = await apiRequest("/v1/consents", {
    method: "POST",
    token,
    body: { kind: CONSENT_KIND, textVersion: CONSENT_TEXT_VERSION },
  });
  if (result.ok) {
    accountChanged();
    return "agreed";
  }
  if (result.error === "consent_text_outdated") return "outdated";
  return result.error === "provider_unavailable" ? "unavailable" : "failed";
}

/** 설정 「동의 거두기」 */
export async function withdrawConsent(): Promise<boolean> {
  const token = await sessionToken();
  if (!token) return false;
  const result = await apiRequest("/v1/consents/withdraw", {
    method: "POST",
    token,
    body: { kind: CONSENT_KIND },
  });
  if (result.ok) accountChanged();
  return result.ok;
}

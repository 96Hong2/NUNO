import type { SqlClient } from "../db/sql-client.ts";

/** 동의 종류. 완성 룩을 만들 때 트윈 그림과 옷 사진을 AI 업체로 보내는 동의 하나다. */
export const CONSENT_KIND = "generation_transfer";

/**
 * 동의 화면 문구의 판 번호. 앱 번들 문구와 판이 다르면 동의를 받지 않는다(409).
 * 쓰는 공급사를 바꾸면 이 판을 먼저 올린다.
 */
export const CONSENT_TEXT_VERSION = 1;

export interface ConsentState {
  agreed: boolean;
  textVersion: number | null;
  currentVersion: number;
}

/** 철회하지 않은 마지막 동의가 지금 판이면 동의한 것이다. */
export async function consentState(db: SqlClient, userId: string): Promise<ConsentState> {
  const [row] = await db.query<{ text_version: number }>(
    `SELECT text_version FROM consents
     WHERE user_id = $1 AND kind = $2 AND withdrawn_at IS NULL
     ORDER BY agreed_at DESC LIMIT 1`,
    [userId, CONSENT_KIND],
  );
  const textVersion = row?.text_version ?? null;
  return {
    agreed: textVersion === CONSENT_TEXT_VERSION,
    textVersion,
    currentVersion: CONSENT_TEXT_VERSION,
  };
}

export interface ConsentProvider {
  currentVersion: number;
  provider: string | null;
  country: string | null;
}

/** 동의 화면에 적을 받는 곳. 켜 둔 공급사 가운데 우선순위가 가장 앞선 줄이다. */
export async function consentProvider(db: SqlClient): Promise<ConsentProvider> {
  const [row] = await db.query<{ provider: string; country: string }>(
    `SELECT provider, country FROM provider_configs
     WHERE enabled ORDER BY priority, provider LIMIT 1`,
  );
  return {
    currentVersion: CONSENT_TEXT_VERSION,
    provider: row?.provider ?? null,
    country: row?.country ?? null,
  };
}

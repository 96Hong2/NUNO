import type { SqlClient } from "../db/sql-client.ts";

/** 동의 종류. 완성 룩을 만들 때 트윈 그림과 옷 사진을 AI 업체로 보내는 동의 하나다. */
export const CONSENT_KIND = "generation_transfer";

/**
 * 판 0004 의 `provider_configs.consent_text_version` 기본값. 지금 판은 이 상수가 아니라 쓰는 공급사 설정 줄에서 읽는다.
 */
export const CONSENT_TEXT_VERSION = 1;

/** 지금 쓰는 공급사 설정 줄. 켜 둔 줄이 없으면 null 이고, 그동안 동의와 접수를 받지 않는다. */
export interface CurrentProviderConfig {
  id: string;
  consentTextVersion: number;
  /** AI 업체 서버가 받은 자료를 두는 날 수 */
  retentionDays: number;
  provider: string;
  country: string;
}

export async function currentProviderConfig(db: SqlClient): Promise<CurrentProviderConfig | null> {
  const [row] = await db.query<{
    id: string;
    consent_text_version: number;
    retention_days: number;
    provider: string;
    country: string;
  }>("SELECT * FROM nuno_current_provider_config()");
  if (!row) return null;
  return {
    id: row.id,
    consentTextVersion: row.consent_text_version,
    retentionDays: row.retention_days,
    provider: row.provider,
    country: row.country,
  };
}

export interface ConsentState {
  agreed: boolean;
  textVersion: number | null;
  /** 지금 공급사 설정 줄의 판. 켜 둔 줄이 없으면 null */
  currentVersion: number | null;
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
  const currentVersion = (await currentProviderConfig(db))?.consentTextVersion ?? null;
  return {
    agreed: textVersion !== null && textVersion === currentVersion,
    textVersion,
    currentVersion,
  };
}

export interface ConsentProvider {
  currentVersion: number | null;
  provider: string | null;
  country: string | null;
}

/** 동의 화면에 적을 받는 곳. 지금 쓰는 공급사 설정 줄이다. */
export async function consentProvider(db: SqlClient): Promise<ConsentProvider> {
  const config = await currentProviderConfig(db);
  return {
    currentVersion: config?.consentTextVersion ?? null,
    provider: config?.provider ?? null,
    country: config?.country ?? null,
  };
}

import type { SqlClient } from "../db/sql-client.ts";

/** 완성 룩 한 장 값. DB 접수 함수의 상수와 같다. */
export const LOOK_PRICE_GOLD = 4;

export interface GoldEntry {
  at: string;
  label: string;
  amount: number;
}

export interface GoldSummary {
  /** 남은 무료 장 수. trial 잔액을 한 장 값으로 나눈 몫이다. */
  trialCount: number;
  /** 무상 골드와 유상 골드의 합. */
  balance: number;
  /** 무상 골드와 유상 골드가 움직인 거래. 최근 순이다. */
  entries: GoldEntry[];
}

const LABELS: Record<string, string> = { hold: "완성 룩 1장", release: "완성 룩 환불" };

/** 「내 골드」 화면 값. 묶음이 확정될 때는 골드가 이미 묶기에서 빠졌으므로 줄을 더하지 않는다. */
export async function goldSummary(db: SqlClient, userId: string): Promise<GoldSummary> {
  const balances = await db.query<{ kind: string; balance: number }>(
    `SELECT a.kind, coalesce(sum(e.amount), 0)::int AS balance
     FROM gold_accounts a LEFT JOIN gold_entries e ON e.account_id = a.id
     WHERE a.user_id = $1
     GROUP BY a.kind`,
    [userId],
  );
  const balanceOf = (kind: string) => balances.find((row) => row.kind === kind)?.balance ?? 0;

  const rows = await db.query<{ at: Date; kind: string; memo: string | null; amount: number }>(
    `SELECT t.created_at AS at, t.kind, t.memo, sum(e.amount)::int AS amount
     FROM gold_entries e
     JOIN gold_accounts a ON a.id = e.account_id
     JOIN gold_transactions t ON t.id = e.transaction_id
     WHERE a.user_id = $1 AND a.kind IN ('free_gold', 'paid_gold') AND t.kind <> 'capture'
     GROUP BY t.id, t.created_at, t.kind, t.memo
     ORDER BY t.created_at DESC, CASE t.kind WHEN 'release' THEN 0 WHEN 'hold' THEN 1 ELSE 2 END`,
    [userId],
  );

  return {
    trialCount: Math.floor(balanceOf("trial") / LOOK_PRICE_GOLD),
    balance: balanceOf("free_gold") + balanceOf("paid_gold"),
    entries: rows
      .filter((row) => row.amount !== 0)
      .map((row) => ({
        at: row.at.toISOString(),
        label: LABELS[row.kind] ?? row.memo ?? "골드",
        amount: row.amount,
      })),
  };
}

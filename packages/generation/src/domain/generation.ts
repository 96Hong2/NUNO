import { toKstDateString } from "@nuno/clock";

/** 완성 룩 한 장 값(골드). 서버 접수 함수의 상수와 같다. */
export const LOOK_PRICE_GOLD = 4;

/** 1골드의 원화 값 */
export const GOLD_WON = 100;

/** 가입하면 서버가 한 번 넣어 주는 무료 장 수. 가입 전 무대 단추가 이 값을 보인다. */
export const SIGNUP_TRIAL_COUNT = 2;

/**
 * 앱에 든 동의 문구의 판 번호. 서버 판과 다르면 서버가 409 `consent_text_outdated` 를 준다.
 * 아래 보관 일수와 문구를 바꾸면 이 판을 올린다.
 */
export const CONSENT_TEXT_VERSION = 1;

/** 동의 문구 「받은 자료는 N일 두고 지워요」 의 N. 공급사 계약의 보관 기본값이다. */
export const PROVIDER_RETENTION_DAYS = 30;

/** 동의가 없거나, 거뒀거나, 앱 문구와 판이 다르면 동의 화면을 먼저 연다. */
export function consentNeeded(
  consent: { agreed: boolean; textVersion: number | null } | null,
): boolean {
  return !consent || !consent.agreed || consent.textVersion !== CONSENT_TEXT_VERSION;
}

/** 프리셋 트윈 그림의 판. 그림을 바꾸면 올린다. */
export const TWIN_PRESET_VERSION = 1;

/** 공급사에 보내는 만들기 지시문의 판 */
export const PROMPT_VERSION = 1;

/** 서버 작업 상태. 앞 셋은 아직 끝나지 않은 상태다. */
export type GenerationJobStatus = "queued" | "generating" | "checking" | "succeeded" | "failed";

export type PaymentKind = "trial" | "gold";

const FINISHED: readonly string[] = ["succeeded", "failed"];

export function isFinishedStatus(status: string): boolean {
  return FINISHED.includes(status);
}

/** 무대 「이대로 입히기」 안 작은 글자 */
export function stagePriceLabel(trialCount: number): string {
  return trialCount > 0 ? `무료 ${trialCount}장 남음` : `${LOOK_PRICE_GOLD}골드`;
}

export interface MakeSheetCopy {
  line: string;
  button: string;
  /** 무료 장이 없어 골드 확인 시트를 거친다 */
  needsGold: boolean;
}

/** 「완성 룩 만들기」 시트의 아래 줄과 단추 글자 */
export function makeSheetCopy(trialCount: number): MakeSheetCopy {
  if (trialCount > 0) {
    return {
      line: `이번에는 첫 체험 무료 ${trialCount}장 중 1장을 써요`,
      button: "무료로 만들기",
      needsGold: false,
    };
  }
  return {
    line: `이번에는 내 골드에서 ${LOOK_PRICE_GOLD}골드를 써요`,
    button: "만들기",
    needsGold: true,
  };
}

export interface GoldConfirmCopy {
  balanceLine: string;
  short: boolean;
}

/** 골드 확인 시트의 「내 골드」 줄. 모자라면 체리색 줄이고 쓰기 단추가 없다. */
export function goldConfirmCopy(balance: number): GoldConfirmCopy {
  const need = LOOK_PRICE_GOLD - balance;
  if (need > 0) return { balanceLine: `${balance}골드, ${need}골드 모자라요`, short: true };
  return { balanceLine: `${balance} → ${balance - LOOK_PRICE_GOLD}골드`, short: false };
}

export interface ProgressStep {
  percent: number;
  label: string;
}

/** 만드는 중 화면의 막대와 단계 글자. 작업 상태로 고른다. */
export function progressStep(status: string): ProgressStep {
  if (status === "queued") return { percent: 33, label: "옷을 입히고 있어요" };
  if (status === "generating") return { percent: 67, label: "앞모습을 그리고 있어요" };
  return { percent: 100, label: "다 됐어요" };
}

/** 접수가 거절됐을 때 앱이 보일 다음 화면 */
export type SubmitNext =
  | { kind: "consent" }
  | { kind: "goldShort" }
  | { kind: "signIn" }
  | { kind: "notice"; message: string };

/** 접수 거절 코드(서버 `error`)로 다음 화면을 고른다. */
export function nextAfterRejection(code: string): SubmitNext {
  switch (code) {
    case "consent_required":
      return { kind: "consent" };
    case "insufficient_gold":
      return { kind: "goldShort" };
    case "unauthorized":
      return { kind: "signIn" };
    case "consent_text_outdated":
      return { kind: "notice", message: "앱을 업데이트해 주세요" };
    case "switch_off":
      return {
        kind: "notice",
        message: "지금은 완성 룩을 만들 수 없어요. 잠시 뒤에 다시 해 주세요",
      };
    case "trial_daily_limit":
      return { kind: "notice", message: "오늘은 무료로 더 만들 수 없어요. 내일 다시 해 주세요" };
    case "account_inactive":
      return { kind: "notice", message: "이 계정으로는 지금 만들 수 없어요" };
    default:
      return { kind: "notice", message: "보내지 못했어요. 잠시 뒤에 다시 해 주세요" };
  }
}

export interface FailureCopy {
  title: string;
  body: string;
  refundLabel: string;
  refundValue: string;
  remainLabel: string;
  remainValue: string;
}

/** 「만들지 못했어요」 화면 글자. 골드 작업과 무료 장 작업이 다르다. */
export function failureCopy(kind: PaymentKind, refundGold: number, remain: number): FailureCopy {
  if (kind === "gold") {
    return {
      title: "골드를 돌려드렸어요",
      body: `안전 확인에서 통과하지 못했거나 그림이 깨졌어요. 쓴 ${refundGold}골드는 바로 돌려드렸어요.`,
      refundLabel: "돌려받은 골드",
      refundValue: `+${refundGold} 골드`,
      remainLabel: "지금 남은 골드",
      remainValue: `${remain} 골드`,
    };
  }
  return {
    title: "무료 1장을 돌려드렸어요",
    body: "안전 확인에서 통과하지 못했거나 그림이 깨졌어요. 쓴 무료 1장은 바로 돌려드렸어요.",
    refundLabel: "돌려받은 무료 장",
    refundValue: "+1장",
    remainLabel: "지금 남은 무료 장",
    remainValue: `${remain}장`,
  };
}

/** 「내 골드」 의 「N원어치」 */
export function goldWonLabel(balance: number): string {
  const won = String(balance * GOLD_WON).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${won}원어치`;
}

/** 「사용 내역」 줄의 양: 「+4골드」, 「-4골드」 */
export function goldAmountLabel(amount: number): string {
  return `${amount > 0 ? "+" : ""}${amount}골드`;
}

/** 「사용 내역」 줄의 날짜: 한국 날짜 「MM.DD」 */
export function ledgerDateLabel(at: string): string {
  const [, month = "01", day = "01"] = toKstDateString(new Date(at)).split("-");
  return `${month}.${day}`;
}

/** 옷이 든 옷장 칸. 옷장에 넣지 않은 견본 옷은 null 이다. */
export type ManifestCloset = "mine" | "wanted" | null;

/** 접수 입력 목록의 옷 한 벌 */
export interface ManifestGarment {
  /** 무대 옷 키(`g:<옷 ID>`, `s:<견본 키>`) */
  id: string;
  name: string;
  category: string;
  closet: ManifestCloset;
  /** 그림 해시. 아직 올리기가 없어 빈 값이다 */
  imageHash: string;
}

/** 접수 입력 목록. 같은 생성 요청 ID 에는 같은 목록을 보낸다(서버가 해시로 가린다). */
export interface GenerationManifest {
  twin: { preset: string; version: number };
  items: ManifestGarment[];
  promptVersion: number;
}

export function buildManifest(
  twinKey: string,
  items: readonly ManifestGarment[],
): GenerationManifest {
  return {
    twin: { preset: twinKey, version: TWIN_PRESET_VERSION },
    items: items.map((item) => ({ ...item })),
    promptVersion: PROMPT_VERSION,
  };
}

/** 같은 코디인지 가리는 키. 트윈과 옷 키를 정렬해 잇는다. */
export function outfitKeyOf(manifest: GenerationManifest): string {
  const ids = manifest.items.map((item) => item.id).sort();
  return `${manifest.twin.preset}|${ids.join(",")}`;
}

/** 결과 화면 입은 옷 줄 오른쪽 칸 이름 */
export function closetLabel(closet: ManifestCloset): string {
  if (closet === "mine") return "내 옷";
  if (closet === "wanted") return "담은 옷";
  return "견본 옷";
}

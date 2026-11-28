import { toKstDateString } from "@nuno/clock";

/** 완성 룩 한 장 값(골드). 서버 접수 함수의 상수와 같다. */
export const LOOK_PRICE_GOLD = 4;

/** 1골드의 원화 값 */
export const GOLD_WON = 100;

/** 가입하면 서버가 한 번 넣어 주는 무료 장 수. 가입 전 무대 단추가 이 값을 보인다. */
export const SIGNUP_TRIAL_COUNT = 2;

/**
 * 앱에 든 동의 문구의 판 번호. 서버 판과 다르면 서버가 409 `consent_text_outdated` 를 준다.
 * 동의 화면 문구를 바꾸면 이 판을 올린다. AI 업체 보관 일수는 서버가 준 값을 보이고,
 * 서버는 공급사 설정 줄의 보관 일수를 바꿀 때 그 줄의 판을 함께 올린다.
 */
export const CONSENT_TEXT_VERSION = 1;

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

/**
 * 지금 무료로 접수할 수 있는 장 수. 무료 장이 남아도 오늘 무료 접수가 하루 한도에 닿았으면 0 이다.
 * 무대 단추, 만들기 시트, 접수 결제 선택이 모두 이 값으로 판단한다.
 */
export function freeLooksNow(trialCount: number, trialUsableToday: boolean): number {
  return trialUsableToday ? trialCount : 0;
}

// payWithFor, stagePriceLabel, goldConfirmCopy, progressStep 은 앱이 더는 부르지 않는다.
// main 의 generation.test.ts 가 박아 두어 남기고, 패키지 공개 면에서는 뺐다. 그 시험 줄과 함께 지운다.

/** 접수 본문의 결제 선택. 화면이 무료 장을 보였으면 trial, 골드 확인 시트를 거쳤으면 gold 다 */
export function payWithFor(freeLooks: number): PaymentKind {
  return freeLooks > 0 ? "trial" : "gold";
}

/** 무대 「이대로 입히기」 안 작은 글자. trialCount 는 `freeLooksNow` 값이다 */
export function stagePriceLabel(trialCount: number): string {
  return trialCount > 0 ? `무료 ${trialCount}장 남음` : `${LOOK_PRICE_GOLD}골드`;
}

export interface GoldConfirmCopy {
  /** 왜 골드로 만드는지. 무료 장이 남았으면 오늘 무료 한도에 닿은 것이다 */
  lead: string;
  balanceLine: string;
  short: boolean;
}

/** 골드 확인 시트의 첫 줄과 「내 골드」 줄. 모자라면 체리색 줄이고 쓰기 단추가 없다. */
export function goldConfirmCopy(balance: number, trialCount = 0): GoldConfirmCopy {
  const lead =
    trialCount > 0
      ? "오늘은 무료로 더 만들 수 없어요. 골드로 만들어요"
      : "첫 체험 무료를 다 썼어요. 골드로 만들어요";
  const need = LOOK_PRICE_GOLD - balance;
  if (need > 0) return { lead, balanceLine: `${balance}골드, ${need}골드 모자라요`, short: true };
  return { lead, balanceLine: `${balance} → ${balance - LOOK_PRICE_GOLD}골드`, short: false };
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

/** 무대 「이대로 입히기」 옆 작은 글. freeLooks 는 `freeLooksNow` 값이다 */
export function stageButtonNote(freeLooks: number): string {
  return freeLooks > 0 ? `무료 ${freeLooks}장 남음` : `1장 ${LOOK_PRICE_GOLD}골드`;
}

/** 「1,200원」 처럼 원화 값을 세 자리마다 쉼표로 끊는다 */
function wonLabel(gold: number): string {
  return `${String(gold * GOLD_WON).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

export interface SheetRow {
  label: string;
  value: string;
}

/**
 * 「완성 룩 만들기」 시트 한 틀의 세 상태. 무료 장이 있으면 무료, 골드가 넉넉하면 골드, 모자라면 골드 부족이다.
 * 시트에는 실패했을 때 돌려준다는 글을 미리 두지 않는다. 돌려준 것은 실패 화면에서만 보인다.
 */
export type MakeLookSheetView =
  | {
      kind: "free";
      /** 가격 칸에 줄 그어 보이는 원래 값 */
      listPrice: string;
      price: string;
      note: string;
      button: string;
      payWith: "trial";
    }
  | {
      kind: "gold";
      price: string;
      won: string;
      /** 무료 장이 남았는데 오늘 무료 한도에 닿았을 때만 있다 */
      notice: string | null;
      balance: SheetRow;
      button: string;
      payWith: "gold";
    }
  | { kind: "short"; price: string; notice: string | null; rows: SheetRow[] };

/**
 * 시트 상태와 글. freeLooks 는 `freeLooksNow` 값, trialCount 는 서버의 남은 무료 장, balance 는 내 골드다.
 */
export function makeLookSheetView(
  freeLooks: number,
  trialCount: number,
  balance: number,
): MakeLookSheetView {
  const price = `${LOOK_PRICE_GOLD}골드`;
  if (freeLooks > 0) {
    return {
      kind: "free",
      listPrice: price,
      price: "무료",
      note: `무료로 만들 수 있는 사진이 ${freeLooks}장 남았어요`,
      button: "무료로 만들기",
      payWith: "trial",
    };
  }
  const notice = trialCount > 0 ? "오늘은 무료로 더 만들 수 없어요" : null;
  const need = LOOK_PRICE_GOLD - balance;
  if (need > 0) {
    return {
      kind: "short",
      price,
      notice,
      rows: [
        { label: "필요한 골드", value: price },
        { label: "내 골드", value: `${balance}골드` },
        { label: "부족한 골드", value: `${need}골드` },
      ],
    };
  }
  return {
    kind: "gold",
    price,
    won: wonLabel(LOOK_PRICE_GOLD),
    notice,
    balance: { label: "내 골드", value: `${balance}골드` },
    button: `${LOOK_PRICE_GOLD}골드 사용`,
    payWith: "gold",
  };
}

export interface MakingCopy {
  percent: number;
  title: string;
  note: string;
}

/** 만드는 중 화면의 막대와 글. 막대는 접수, 만드는 중, 안전 확인 세 단계로 3분의 1씩 채운다 */
export function makingCopy(status: string): MakingCopy {
  let percent = 100;
  if (status === "queued") percent = 33;
  else if (status === "generating") percent = 67;
  return {
    percent,
    title: "완성 룩을 만들고 있어요",
    note: "화면을 닫아도 계속 만들어요. 다 되면 알림을 보내 드려요",
  };
}

/** 실패 화면의 주 단추. 시스템 오류면 같은 코디로 다시, 안전 기준이면 코디를 바꾸러 간다 */
export type FailureAction = "retry" | "change";

export interface LookFailureCopy {
  headline: string;
  title: string;
  body: string;
  refund: SheetRow;
  action: FailureAction;
  actionLabel: string;
}

/**
 * 안전 기준 실패 코드: 공급사가 거절했거나(provider_refused), 결과 사진이 자체 안전 검사를 두 번 통과하지 못했다(check_failed).
 * 나머지 실패는 시스템 오류로 읽는다.
 */
const SAFETY_FAILURES: ReadonlySet<string> = new Set(["provider_refused", "check_failed"]);

/** 「만들지 못했어요」 화면 글. 낸 것(골드, 무료 장)과 실패 원인으로 고른다 */
export function lookFailureCopy(
  kind: PaymentKind,
  failureCode: string | null,
  refundGold: number,
): LookFailureCopy {
  const safety = failureCode !== null && SAFETY_FAILURES.has(failureCode);
  return {
    headline: "만들지 못했어요.",
    title: kind === "gold" ? "골드를 돌려드렸어요" : "무료 1장을 돌려드렸어요",
    body: safety ? "안전 기준을 통과하지 못했어요" : "이미지를 만드는 중에 오류가 났어요",
    refund:
      kind === "gold"
        ? { label: "돌려받은 골드", value: goldAmountLabel(refundGold) }
        : { label: "돌려받은 무료 사진", value: "+1장" },
    action: safety ? "change" : "retry",
    actionLabel: safety ? "코디 바꾸기" : "같은 코디로 다시 만들기",
  };
}

/** 접수가 거절됐을 때 앱이 보일 다음 화면 */
export type SubmitNext =
  | { kind: "consent" }
  | { kind: "goldShort" }
  | { kind: "paymentChanged" }
  | { kind: "signIn" }
  | { kind: "notice"; message: string };

/** 접수 거절 코드(서버 `error`)로 다음 화면을 고른다. */
export function nextAfterRejection(code: string): SubmitNext {
  switch (code) {
    case "consent_required":
      return { kind: "consent" };
    case "insufficient_gold":
      return { kind: "goldShort" };
    case "payment_changed":
      return { kind: "paymentChanged" };
    case "unauthorized":
      return { kind: "signIn" };
    case "consent_text_outdated":
      return { kind: "notice", message: "동의 문구가 바뀌었어요. 앱을 업데이트해 주세요" };
    case "switch_off":
    case "provider_unavailable":
      return {
        kind: "notice",
        message: "지금은 완성 룩을 만들 수 없어요. 잠시 후 다시 시도해 주세요",
      };
    case "trial_daily_limit":
      return { kind: "notice", message: "오늘은 완성 룩을 무료로 더 만들 수 없어요. 내일 다시 시도해 주세요" };
    case "account_inactive":
      return { kind: "notice", message: "이 계정으로는 지금 완성 룩을 만들 수 없어요" };
    default:
      return { kind: "notice", message: "완성 룩 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요" };
  }
}

/** 서버가 일부러 준 접수 거절 코드. 이 코드면 5xx 라도 서버가 작업을 받지 않았다(switch_off, provider_unavailable 은 503) */
const SERVER_REJECTIONS: ReadonlySet<string> = new Set([
  "consent_required",
  "payment_changed",
  "account_inactive",
  "insufficient_gold",
  "switch_off",
  "provider_unavailable",
  "trial_daily_limit",
  "request_mismatch",
]);

/**
 * 접수 응답이 이렇게 오면 서버가 이미 받았을 수 있다. 기기 요청 줄을 남기고 작업 감시가 요청 ID 로 다시 묻는다.
 * 닿지 못했거나(status 0) 서버 오류(5xx)이면서 서버가 일부러 준 거절 코드가 아닐 때다.
 */
export function mayHaveBeenAccepted(status: number, code: string): boolean {
  return status === 0 || (status >= 500 && !SERVER_REJECTIONS.has(code));
}

/** 서버가 받았는지 아직 모를 때의 알림. 바로 다시 눌러 같은 코디를 또 보내지 않게 한다 */
export const UNANSWERED_NOTICE: SubmitNext = {
  kind: "notice",
  message: "완성 룩 요청이 접수됐는지 확인하고 있어요. 잠시 후 결과를 알려 드릴게요",
};

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

/** 옷이 든 옷장 칸. 옷장에 넣지 않은 기본 제공 옷은 null 이다. */
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
  if (closet === "mine") return "내 옷장";
  if (closet === "wanted") return "담은 옷";
  return "기본 제공 옷";
}

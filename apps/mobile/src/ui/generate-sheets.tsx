import { makeLookSheetView, type PaymentKind } from "@nuno/generation";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OverlaySheet } from "./overlay-sheet";

/** 「이대로 입히기」, 「무료로 만들기」, 「4골드 사용」 의 체리색 */
export const GENERATE_CHERRY = "#B8233F";

const INK = "#151314";
const SUB = "#5F5C56";
const LINE = "#E7E6E3";

/** 가입 전 「이대로 입히기」 를 누르면 뜨는 가입 시트. 닫아도 무대 코디는 그대로다 */
export function JoinSheet({
  visible,
  devSignIn,
  busy,
  onDevSignIn,
  onClose,
}: {
  visible: boolean;
  /** 웹 개발 빌드면 「시험 계정으로 계속하기」 를 보인다 */
  devSignIn: boolean;
  busy: boolean;
  onDevSignIn: () => void;
  onClose: () => void;
}) {
  return (
    <OverlaySheet visible={visible} title="완성 룩을 만들려면 가입이 필요해요" onClose={onClose}>
      <Text style={styles.body}>가입은 무료예요. 닫아도 지금 코디는 이 휴대폰에 그대로 남아요</Text>
      {devSignIn ? (
        <Pressable
          role="button"
          disabled={busy}
          onPress={onDevSignIn}
          style={[styles.primary, styles.inkFill, busy && styles.busy]}
        >
          <Text style={styles.primaryLabel}>시험 계정으로 계속하기</Text>
        </Pressable>
      ) : null}
      <Text style={styles.foot}>계속하면 이용약관과 개인정보 처리방침에 동의한 것으로 봐요</Text>
    </OverlaySheet>
  );
}

/**
 * 「완성 룩 만들기」 시트. 한 틀이 무료, 골드, 골드 부족 세 상태를 그린다.
 * 골드 부족은 표만 보이고 X 로 닫는다(골드 충전이 생기면 충전 단추를 단다).
 */
export function MakeLookSheet({
  visible,
  freeLooks,
  trialCount,
  balance,
  busy,
  onMake,
  onClose,
}: {
  visible: boolean;
  /** 지금 무료로 접수할 수 있는 장 수(`freeLooksNow`) */
  freeLooks: number;
  /** 서버의 남은 무료 장. 남았는데 freeLooks 가 0 이면 오늘 무료 한도에 닿은 것이다 */
  trialCount: number;
  balance: number;
  busy: boolean;
  onMake: (payWith: PaymentKind) => void;
  onClose: () => void;
}) {
  const view = makeLookSheetView(freeLooks, trialCount, balance);
  const notice = view.kind === "free" ? null : view.notice;
  return (
    <OverlaySheet visible={visible} title="완성 룩 만들기" onClose={onClose}>
      <Text style={styles.body}>
        AI가 옷의 주름과 핏까지 살린 사진을 새로 만들어요. 트윈에 겹쳐 입혀 보기는 늘 무료예요
      </Text>
      {notice ? <Text style={styles.line}>{notice}</Text> : null}
      <View style={styles.priceBox}>
        <Text style={styles.priceLabel}>가격</Text>
        {view.kind === "free" ? (
          <View style={styles.priceFree}>
            <Text aria-label={`원래 ${view.listPrice}`} style={styles.listPrice}>
              {view.listPrice}
            </Text>
            <Text style={styles.freePrice}>{view.price}</Text>
          </View>
        ) : (
          <View style={styles.priceGold}>
            <Text style={styles.goldPrice}>{view.price}</Text>
            {view.kind === "gold" ? <Text style={styles.won}>{view.won}</Text> : null}
          </View>
        )}
      </View>
      {view.kind === "free" ? <Text style={styles.note}>{view.note}</Text> : null}
      {view.kind === "gold" ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{view.balance.label}</Text>
          <Text style={styles.rowValue}>{view.balance.value}</Text>
        </View>
      ) : null}
      {view.kind === "short" ? (
        <View style={styles.table}>
          {view.rows.map((row, index) => {
            const last = index === view.rows.length - 1;
            return (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={[styles.rowValue, last && styles.rowValueStrong]}>{row.value}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Pressable
          role="button"
          disabled={busy}
          onPress={() => onMake(view.payWith)}
          style={[styles.primary, styles.cherryFill, styles.makeButton, busy && styles.busy]}
        >
          <Text style={styles.primaryLabel}>{view.button}</Text>
        </Pressable>
      )}
    </OverlaySheet>
  );
}

/** 결과를 저장하지 않고 뒤로 가면 뜨는 시트. 바깥이나 X 를 누르면 시트만 닫힌다 */
export function LeaveResultSheet({
  visible,
  busy,
  onSave,
  onLeave,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  onSave: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <OverlaySheet visible={visible} title="저장하지 않고 나갈까요?" onClose={onClose}>
      <Text style={styles.body}>나가면 이 사진은 사라져요</Text>
      <Pressable
        role="button"
        disabled={busy}
        onPress={onSave}
        style={[styles.primary, styles.inkFill, busy && styles.busy]}
      >
        <Text style={styles.primaryLabel}>내 룩북에 저장</Text>
      </Pressable>
      <Pressable
        role="button"
        disabled={busy}
        onPress={onLeave}
        style={[styles.primary, styles.secondary, styles.pairButton]}
      >
        <Text style={styles.secondaryLabel}>나가기</Text>
      </Pressable>
    </OverlaySheet>
  );
}

/** 설정의 확인 시트(동의 거두기, 로그아웃): 제목, 안내 한 줄, 검정 단추 하나 */
export function ConfirmSheet({
  visible,
  title,
  body,
  action,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body?: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <OverlaySheet visible={visible} title={title} onClose={onClose}>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      <Pressable
        role="button"
        disabled={busy}
        onPress={onConfirm}
        style={[styles.primary, styles.inkFill, busy && styles.busy]}
      >
        <Text style={styles.primaryLabel}>{action}</Text>
      </Pressable>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, color: SUB },
  foot: { fontSize: 12, lineHeight: 18, color: SUB, textAlign: "center" },
  line: { fontSize: 14, lineHeight: 22, color: SUB },
  // 가격 칸: 높이 56, 모서리 12, 흰 바탕에 2px 잉크 테두리
  priceBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 56,
    marginTop: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: "#fff",
  },
  priceLabel: { fontSize: 16, fontWeight: "600", color: INK },
  priceFree: { flexDirection: "row", alignItems: "center", gap: 6 },
  listPrice: { fontSize: 13, color: SUB, textDecorationLine: "line-through" },
  freePrice: { fontSize: 16, fontWeight: "700", color: GENERATE_CHERRY },
  priceGold: { alignItems: "flex-end" },
  goldPrice: { fontSize: 16, fontWeight: "700", color: INK },
  won: { fontSize: 12, color: SUB },
  note: { fontSize: 14, lineHeight: 22, color: SUB, marginTop: -2 },
  table: { gap: 2 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 22,
  },
  rowLabel: { fontSize: 14, color: SUB },
  rowValue: { fontSize: 14, fontWeight: "600", color: INK },
  rowValueStrong: { fontSize: 16, fontWeight: "700" },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
  },
  inkFill: { backgroundColor: INK },
  cherryFill: { backgroundColor: GENERATE_CHERRY },
  // 남은 무료 장 줄이나 「내 골드」 줄에서 20 아래
  makeButton: { marginTop: 6 },
  secondary: { borderWidth: 1, borderColor: LINE, backgroundColor: "#fff" },
  pairButton: { marginTop: -6 },
  busy: { opacity: 0.6 },
  primaryLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryLabel: { color: INK, fontSize: 16, fontWeight: "600" },
});

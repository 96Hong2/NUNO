import { goldConfirmCopy, LOOK_PRICE_GOLD, makeSheetCopy } from "@nuno/generation";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OverlaySheet } from "./overlay-sheet";

/** 「이대로 입히기」 와 골드 모자람 줄의 체리색(와이어프레임 v26) */
export const GENERATE_CHERRY = "#B8233F";

const INK = "#151314";
const SUB = "#76736C";

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
    <OverlaySheet visible={visible} title="골드를 쓰려면 가입해요" onClose={onClose}>
      <Text style={styles.body}>닫아도 지금 코디는 이 휴대폰에 그대로 남아요.</Text>
      {devSignIn ? (
        <Pressable
          role="button"
          disabled={busy}
          onPress={onDevSignIn}
          style={[styles.primary, busy && styles.busy]}
        >
          <Text style={styles.primaryLabel}>시험 계정으로 계속하기</Text>
        </Pressable>
      ) : null}
      <Text style={styles.foot}>계속하면 이용약관과 개인정보 처리방침에 동의한 것으로 봐요</Text>
    </OverlaySheet>
  );
}

/** 「완성 룩 만들기」 시트. 무료 장이 있으면 「무료로 만들기」, 없으면 「만들기」 로 골드 확인 시트를 연다 */
export function MakeLookSheet({
  visible,
  trialCount,
  busy,
  onMake,
  onClose,
}: {
  visible: boolean;
  trialCount: number;
  busy: boolean;
  onMake: () => void;
  onClose: () => void;
}) {
  const copy = makeSheetCopy(trialCount);
  return (
    <OverlaySheet visible={visible} title="완성 룩 만들기" onClose={onClose}>
      <Text style={styles.body}>
        AI 가 주름과 핏까지 입힌 사진을 새로 만들어요. 무대에서 겹쳐 보는 것은 늘 무료예요.
      </Text>
      <View role="radio" aria-checked style={styles.option}>
        <Text style={styles.optionLabel}>앞 1장</Text>
        <Text style={styles.optionPrice}>{LOOK_PRICE_GOLD}골드</Text>
      </View>
      <Text style={styles.line}>{copy.line}</Text>
      <Pressable
        role="button"
        disabled={busy}
        onPress={onMake}
        style={[styles.primary, busy && styles.busy]}
      >
        <Text style={styles.primaryLabel}>{copy.button}</Text>
      </Pressable>
    </OverlaySheet>
  );
}

/** 골드 확인 시트 「완성 룩 1장 만들기」. 모자라면 체리색 줄과 「닫기」 만 둔다(충전은 아직 없다) */
export function GoldConfirmSheet({
  visible,
  balance,
  trialCount,
  busy,
  onSpend,
  onClose,
}: {
  visible: boolean;
  balance: number;
  /** 남은 무료 장. 남았는데 이 시트가 뜨면 오늘 무료 한도에 닿은 것이다 */
  trialCount: number;
  busy: boolean;
  onSpend: () => void;
  onClose: () => void;
}) {
  const copy = goldConfirmCopy(balance, trialCount);
  return (
    <OverlaySheet visible={visible} title="완성 룩 1장 만들기" onClose={onClose} hideClose>
      <Text style={styles.body}>{copy.lead}</Text>
      <View style={styles.rule} />
      <View style={styles.row}>
        <Text style={styles.rowLabel}>필요한 골드</Text>
        <Text style={styles.rowValue}>{LOOK_PRICE_GOLD}골드</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>내 골드</Text>
        <Text style={[styles.rowValue, copy.short && styles.short]}>{copy.balanceLine}</Text>
      </View>
      <Text style={styles.line}>만들지 못하면 쓴 골드를 돌려드려요</Text>
      {copy.short ? null : (
        <Pressable
          role="button"
          disabled={busy}
          onPress={onSpend}
          style={[styles.primary, busy && styles.busy]}
        >
          <Text style={styles.primaryLabel}>{LOOK_PRICE_GOLD}골드 쓰기</Text>
        </Pressable>
      )}
      <Pressable role="button" onPress={onClose} style={styles.textButton}>
        <Text style={styles.textButtonLabel}>닫기</Text>
      </Pressable>
    </OverlaySheet>
  );
}

/** 결과를 저장하지 않고 뒤로 가면 뜨는 시트. 바깥을 누르면 시트만 닫힌다 */
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
    <OverlaySheet visible={visible} title="저장하지 않고 나갈까요?" onClose={onClose} hideClose>
      <Text style={styles.body}>나가면 이 사진은 사라져요</Text>
      <Pressable
        role="button"
        disabled={busy}
        onPress={onSave}
        style={[styles.primary, busy && styles.busy]}
      >
        <Text style={styles.primaryLabel}>내 룩북에 저장</Text>
      </Pressable>
      <Pressable role="button" disabled={busy} onPress={onLeave} style={styles.textButton}>
        <Text style={styles.textButtonLabel}>나가기</Text>
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
        style={[styles.primary, busy && styles.busy]}
      >
        <Text style={styles.primaryLabel}>{action}</Text>
      </Pressable>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 21, color: SUB },
  foot: { fontSize: 12, lineHeight: 18, color: SUB, textAlign: "center" },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: "#F7F7F7",
  },
  optionLabel: { fontSize: 15, fontWeight: "700", color: INK },
  optionPrice: { fontSize: 15, fontWeight: "800", color: INK },
  line: { fontSize: 13, color: SUB },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: INK,
  },
  busy: { opacity: 0.6 },
  primaryLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: "#E7E6E3" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 15, color: SUB },
  rowValue: { fontSize: 15, fontWeight: "800", color: INK },
  short: { color: GENERATE_CHERRY },
  textButton: { alignItems: "center", paddingVertical: 6 },
  textButtonLabel: { fontSize: 14, color: SUB },
});

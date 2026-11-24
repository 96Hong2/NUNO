import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface FlowScreenProps {
  /** 오른쪽 위 「2 / 4」. 없으면 비운다. */
  step?: string;
  title: string;
  sub?: string;
  onBack: () => void;
  /** 왼쪽 위 단추. 첫 단계는 닫기(✕), 나머지는 뒤로(‹) */
  backKind?: "back" | "close";
  children: ReactNode;
  /** 화면 아래에 붙는 단추 */
  footer?: ReactNode;
  dark?: boolean;
}

/** 옷 넣기 네 단계 화면의 공통 틀: 위 줄, 제목, 설명, 본문, 아래 단추 */
export function FlowScreen(props: FlowScreenProps) {
  const dark = props.dark === true;
  return (
    <View style={[styles.screen, dark && styles.screenDark]}>
      <View style={styles.top}>
        <Pressable
          role="button"
          aria-label={props.backKind === "close" ? "닫기" : "뒤로"}
          hitSlop={12}
          onPress={props.onBack}
        >
          <Text style={[styles.back, dark && styles.light]}>
            {props.backKind === "close" ? "✕" : "‹"}
          </Text>
        </Pressable>
        {props.step ? <Text style={[styles.step, dark && styles.light]}>{props.step}</Text> : null}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text role="heading" aria-level={1} style={[styles.title, dark && styles.light]}>
          {props.title}
        </Text>
        {props.sub ? <Text style={[styles.sub, dark && styles.subDark]}>{props.sub}</Text> : null}
        {props.children}
      </ScrollView>
      {props.footer ? <View style={styles.footer}>{props.footer}</View> : null}
    </View>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  /** 누를 수 없다(진행 중 등). */
  disabled?: boolean;
  /** 회색으로 보이지만 누르면 무엇이 빠졌는지 알림을 띄운다. */
  dimmed?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, dimmed }: PrimaryButtonProps) {
  const off = disabled === true || dimmed === true;
  return (
    <Pressable
      role="button"
      disabled={disabled}
      aria-disabled={off}
      onPress={onPress}
      style={StyleSheet.flatten([styles.primary, off && styles.primaryOff])}
    >
      <Text style={[styles.primaryLabel, off && styles.primaryLabelOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFCFC" },
  screenDark: { backgroundColor: "#151314" },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  back: { fontSize: 28, lineHeight: 30, color: "#151314" },
  step: { fontSize: 15, color: "#76736C" },
  light: { color: "#fff" },
  body: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
  title: { fontSize: 26, fontWeight: "800", color: "#151314", marginTop: 8 },
  sub: { fontSize: 15, lineHeight: 22, color: "#76736C" },
  subDark: { color: "#C9C6C0" },
  footer: { position: "absolute", left: 20, right: 20, bottom: 20, gap: 10 },
  primary: {
    alignItems: "center",
    paddingVertical: 17,
    borderRadius: 14,
    backgroundColor: "#151314",
  },
  primaryOff: { backgroundColor: "#E7E6E3" },
  primaryLabel: { color: "#fff", fontSize: 17, fontWeight: "700" },
  primaryLabelOff: { color: "#76736C" },
});

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useToastOverSheet } from "./app-toast";
import { CloseIcon } from "./line-icon";

const INK = "#151314";

interface OverlaySheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** 머리 제목과 닫기 사이에 두는 단추 */
  headerAction?: ReactNode;
  /** 머리 오른쪽 ✕ 를 숨긴다. 시트 안에 「닫기」 단추를 따로 두는 시트가 쓴다 */
  hideClose?: boolean;
  children: ReactNode;
}

/**
 * 화면 안에서 아래로부터 올라오는 시트. 뒤는 어둡게 덮고 바깥을 누르면 닫힌다.
 * Modal 을 쓰지 않아 앱 알림 띠가 시트 위에 보인다. 열려 있는 동안 알림 띠는 화면 위쪽에 뜬다.
 */
export function OverlaySheet({
  visible,
  title,
  onClose,
  headerAction,
  hideClose = false,
  children,
}: OverlaySheetProps) {
  useToastOverSheet(visible);
  if (!visible) return null;
  return (
    <View style={styles.layer}>
      <Pressable role="button" aria-label="시트 닫기" style={styles.backdrop} onPress={onClose} />
      <View role="dialog" aria-label={title} style={styles.sheet}>
        <View style={styles.grip} />
        <View style={styles.head}>
          <Text role="heading" aria-level={3} style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {headerAction}
          {hideClose ? null : (
            <Pressable role="button" aria-label="닫기" onPress={onClose} style={styles.close}>
              <CloseIcon color={INK} />
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: "flex-end" },
  // 뒤 화면은 ink 40% 로 덮는다.
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(21,19,20,0.4)" },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
    boxShadow: "0px -2px 12px rgba(21,19,20,0.06)",
  },
  grip: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(21,19,20,0.2)",
  },
  // 손잡이 아래 12 에 높이 44 제목 줄. 시트 칸 사이(14)보다 2 당긴다.
  head: { minHeight: 44, marginTop: -2, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: 20, lineHeight: 28, fontWeight: "700", color: INK },
  // X 24 아이콘, 누르는 영역 44. 오른쪽 끝을 시트 안쪽 여백에 맞춘다.
  close: {
    width: 44,
    height: 44,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
});

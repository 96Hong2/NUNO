import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
 * Modal 을 쓰지 않아 앱 알림 띠가 시트 위에 보인다.
 */
export function OverlaySheet({
  visible,
  title,
  onClose,
  headerAction,
  hideClose = false,
  children,
}: OverlaySheetProps) {
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
            <Pressable role="button" aria-label="닫기" hitSlop={12} onPress={onClose}>
              <Text style={styles.close}>✕</Text>
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
  },
  grip: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E7E6E3",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: "#151314" },
  close: { fontSize: 18, color: "#151314" },
});

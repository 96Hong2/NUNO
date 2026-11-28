import { closetSlotsLabel, type GarmentMethod } from "@nuno/wardrobe";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface AddGarmentSheetProps {
  visible: boolean;
  /** 시트 아래 줄 「내 옷장 N / 100칸」 */
  counts: { mine: number; wanted: number } | null;
  onPick: (method: GarmentMethod) => void;
  onClose: () => void;
}

const METHODS: { method: GarmentMethod; icon: string; label: string; hint: string }[] = [
  { method: "camera", icon: "📷", label: "사진 찍기", hint: "옷만 바닥에 펴고 찍어요" },
  { method: "album", icon: "🖼", label: "앨범에서 고르기", hint: "상품 사진이나 옷 사진을 골라요" },
];

// 웹 Modal 은 닫히는 움직임이 끝나야 빠진다. 사진을 고른 뒤 옷장 화면이 가려지면 그 움직임이 끝나지 않아,
// 보이지 않는 시트가 남아 다음 단계 입력칸의 초점을 빼앗는다. 그래서 웹에서는 움직임 없이 바로 닫는다.
const SHEET_ANIMATION = Platform.OS === "web" ? "none" : "slide";

/** 「옷 추가」 를 누르면 뜨는 「옷을 어떻게 추가할까요?」 시트. 링크와 스토어로 넣기는 2차 출시에 연다. */
export function AddGarmentSheet({ visible, counts, onPick, onClose }: AddGarmentSheetProps) {
  return (
    <Modal visible={visible} transparent animationType={SHEET_ANIMATION} onRequestClose={onClose}>
      <Pressable role="button" style={styles.backdrop} onPress={onClose} aria-label="닫기" />
      <View role="dialog" aria-label="옷을 어떻게 추가할까요?" style={styles.sheet}>
        <View style={styles.grip} />
        <Text role="heading" aria-level={3} style={styles.title}>
          옷을 어떻게 추가할까요?
        </Text>
        <View style={styles.row}>
          {METHODS.map((item) => (
            <Pressable
              key={item.method}
              role="button"
              aria-label={item.label}
              onPress={() => onPick(item.method)}
              style={styles.card}
            >
              <Text style={styles.icon}>{item.icon}</Text>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.hint}>{item.hint}</Text>
            </Pressable>
          ))}
        </View>
        {counts ? (
          <Text style={styles.count}>{closetSlotsLabel(counts)}</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(21,19,20,0.4)" },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
  },
  grip: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(21,19,20,0.2)",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#151314" },
  row: { flexDirection: "row", gap: 10 },
  card: { flex: 1, gap: 6, padding: 16, borderRadius: 14, backgroundColor: "#F6F5F3" },
  icon: { fontSize: 20 },
  label: { fontSize: 16, fontWeight: "700", color: "#151314" },
  hint: { fontSize: 13, lineHeight: 18, color: "#5F5C56" },
  count: { fontSize: 13, color: "#5F5C56" },
});

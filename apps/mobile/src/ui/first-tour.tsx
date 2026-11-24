import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

// 처음 둘러보기. 있는 화면만 안내한다. 피팅룸 코디 장은 코디 무대를 만드는 T4 에서 더한다.
const PAGES = [
  { title: "내 트윈이에요", body: "고른 트윈이 기본 코디로 여기에 서요" },
  { title: "트윈 바꾸기", body: "다른 트윈으로 언제든 바꿀 수 있어요" },
  { title: "내 옷 넣기", body: "옷 사진을 넣으면 배경을 지워 피팅룸 옷장에 담아요" },
  { title: "피팅룸과 마이", body: "아래 탭에서 피팅룸과 마이로 갈 수 있어요" },
] as const;

/** 끝까지 넘기거나(「시작하기」) 닫으면(「닫기」) onDone 을 부른다. */
export function FirstTour({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const page = PAGES[index] ?? PAGES[0];
  const last = index === PAGES.length - 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View role="dialog" aria-label="처음 둘러보기" style={styles.card}>
          <Text style={styles.count}>
            {index + 1} / {PAGES.length}
          </Text>
          <Text role="heading" aria-level={3} style={styles.title}>
            {page.title}
          </Text>
          <Text style={styles.body}>{page.body}</Text>
          <View style={styles.actions}>
            <Pressable role="button" onPress={onDone} style={styles.close}>
              <Text style={styles.closeLabel}>닫기</Text>
            </Pressable>
            <Pressable
              role="button"
              onPress={() => (last ? onDone() : setIndex(index + 1))}
              style={styles.next}
            >
              <Text style={styles.nextLabel}>{last ? "시작하기" : "다음"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  card: { padding: 24, gap: 10, borderRadius: 16, backgroundColor: "#fff" },
  count: { fontSize: 13, color: "#777" },
  title: { fontSize: 20, fontWeight: "700" },
  body: { fontSize: 15, color: "#333", lineHeight: 22 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  close: { paddingVertical: 10, paddingHorizontal: 16 },
  closeLabel: { fontSize: 15, color: "#555" },
  next: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: "#111" },
  nextLabel: { fontSize: 15, color: "#fff", fontWeight: "600" },
});

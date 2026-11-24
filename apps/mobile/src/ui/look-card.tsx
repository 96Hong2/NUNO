import { savedAgoLabel } from "@nuno/lookbook";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BookLook } from "../composition/lookbook";
import { BookLookImage } from "./book-look-image";

/** 홈 「최근 저장한 룩」 카드: 그림, 「✦ AI 생성」(사진일 때), 「옷 N벌」, 제목, 저장 시점 글 */
export function LookCard({ look, onPress }: { look: BookLook; onPress: () => void }) {
  const itemCount = look.kind === "device" ? look.look.items.length : look.look.wornItems.length;
  return (
    <Pressable
      role="button"
      aria-label={`${look.title} 룩 보기`}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.photo}>
        <BookLookImage look={look} badge />
        <View style={styles.count}>
          <Text style={styles.countLabel}>옷 {itemCount}벌</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {look.title}
      </Text>
      <Text style={styles.ago}>{savedAgoLabel(look.savedAt, new Date())}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  photo: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 14 },
  count: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  countLabel: { fontSize: 11, fontWeight: "700", color: "#151314" },
  title: { fontSize: 14, fontWeight: "700", color: "#151314" },
  ago: { fontSize: 12, color: "#76736C" },
});

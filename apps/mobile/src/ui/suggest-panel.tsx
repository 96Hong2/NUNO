import { categoryLabel } from "@nuno/wardrobe";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogItem } from "./coordi-catalog";

interface SuggestPanelProps {
  picks: readonly CatalogItem[];
  onWear: (item: CatalogItem) => void;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * 무대 「내 옷으로 추천」 이 여는 「지금 코디에 어울리는 옷」. 옷장에 있는 옷에서 고른다.
 * 「입어보기」 를 눌러야 입는다.
 */
export function SuggestPanel({ picks, onWear, onRetry, onClose }: SuggestPanelProps) {
  return (
    <View role="region" aria-label="지금 코디에 어울리는 옷" style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.flex}>
          <Text style={styles.panelTitle}>지금 코디에 어울리는 옷</Text>
          <Text style={styles.panelSub}>내 옷장에서 골랐어요</Text>
        </View>
        <Pressable role="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryLabel}>↻ 다시 추천</Text>
        </Pressable>
        <Pressable role="button" aria-label="추천 닫기" hitSlop={10} onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.picks}>
        {picks.length === 0 ? (
          <Text style={styles.panelSub}>추천할 옷이 아직 없어요</Text>
        ) : (
          picks.map((item) => (
            <View key={item.key} style={styles.pick}>
              <View style={styles.pickPhoto}>
                <Image source={item.thumb} resizeMode="contain" style={styles.fill} />
              </View>
              <Text style={styles.pickCategory}>{categoryLabel(item.category)}</Text>
              <Text style={styles.pickName} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable
                role="button"
                aria-label={`${item.name} 입어보기`}
                onPress={() => onWear(item)}
                style={styles.wear}
              >
                <Text style={styles.wearLabel}>입어보기</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      <Text style={styles.panelNote}>「입어보기」를 눌러야 트윈이 입어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: "100%", height: "100%" },
  panel: { gap: 10, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: "#F6F5F3" },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  panelTitle: { fontSize: 15, fontWeight: "700", color: "#151314" },
  panelSub: { fontSize: 12, color: "#5F5C56" },
  retry: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "#fff" },
  retryLabel: { fontSize: 12, color: "#151314" },
  close: { fontSize: 16, color: "#151314" },
  picks: { flexDirection: "row", gap: 8 },
  pick: { flex: 1, gap: 3 },
  pickPhoto: { aspectRatio: 1, padding: 6, borderRadius: 10, backgroundColor: "#fff" },
  pickCategory: { fontSize: 11, color: "#5F5C56" },
  pickName: { fontSize: 12, color: "#151314" },
  wear: { alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: "#E7E6E3" },
  wearLabel: { fontSize: 12, fontWeight: "600", color: "#151314" },
  panelNote: { fontSize: 11, color: "#5F5C56" },
});

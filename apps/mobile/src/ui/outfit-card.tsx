import { refKey, type Outfit, type OutfitCategory } from "@nuno/outfit";
import { GARMENT_CATEGORIES } from "@nuno/wardrobe";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { lookPhotoOf, type CatalogItem } from "./coordi-catalog";
import { STAGE_PINK } from "./coordi-stage";
import { CHERRY } from "./garment-card";

const ORDER: readonly OutfitCategory[] = GARMENT_CATEGORIES.map((category) => category.key);

interface OutfitCardProps {
  title: string;
  /** 왼쪽 아래 흰 알약: 「내가 입혀 봄」, 「NUNO 추천」 */
  badge: string;
  wearing: boolean;
  twinKey: string;
  outfit: Outfit;
  catalog: ReadonlyMap<string, CatalogItem>;
  onPress: () => void;
}

/**
 * 코디 줄 카드. 트윈이 입은 사진이 있으면 그 사진, 없으면 옷 그림 네 칸(아우터, 상의, 하의, 신발, 가방, 액세서리 순 앞 넷).
 * 지금 입은 코디면 체리색 테두리와 「입는 중」 이 붙는다.
 */
export function OutfitCard(props: OutfitCardProps) {
  const { title, badge, wearing, twinKey, outfit, catalog } = props;
  const photo = lookPhotoOf(twinKey, outfit);
  const items = [...outfit]
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category))
    .map((piece) => catalog.get(refKey(piece.ref)))
    .filter((item): item is CatalogItem => Boolean(item))
    .slice(0, 4);
  return (
    <Pressable
      role="button"
      aria-label={`${title} 코디${wearing ? ", 입는 중" : ""}`}
      onPress={props.onPress}
      style={styles.card}
    >
      <View style={[styles.photo, wearing && styles.photoOn]}>
        {photo ? (
          <Image source={photo} resizeMode="cover" style={styles.fill} />
        ) : (
          <View style={styles.grid}>
            {items.map((item) => (
              <View key={item.key} style={styles.cell}>
                <Image source={item.thumb} resizeMode="contain" style={styles.fill} />
              </View>
            ))}
          </View>
        )}
        {wearing ? (
          <View style={styles.wearing}>
            <Text style={styles.wearingLabel}>입는 중</Text>
          </View>
        ) : null}
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

// 카드 크기는 와이어프레임 코디 줄 카드(66x88)와 같다.
const styles = StyleSheet.create({
  card: { width: 66, gap: 4 },
  photo: {
    width: 66,
    height: 88,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: STAGE_PINK,
  },
  photoOn: { borderWidth: 2, borderColor: CHERRY },
  fill: { width: "100%", height: "100%" },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", backgroundColor: "#F4F3F1" },
  cell: { width: "50%", height: "50%", padding: 3 },
  wearing: {
    position: "absolute",
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(21,19,20,0.8)",
  },
  wearingLabel: { color: "#fff", fontSize: 9, fontWeight: "700" },
  badge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  badgeLabel: { color: "#151314", fontSize: 9, fontWeight: "600" },
  title: { fontSize: 11, color: "#151314" },
});

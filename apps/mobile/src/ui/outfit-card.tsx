import { refKey, type Outfit, type OutfitCategory } from "@nuno/outfit";
import { GARMENT_CATEGORIES } from "@nuno/wardrobe";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { lookPhotoOf, type CatalogItem } from "./coordi-catalog";
import { STAGE_PINK } from "./coordi-stage";

const CHERRY = "#B8233F";

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
          <Text style={styles.badgeLabel} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

// 카드 크기는 와이어프레임 v27 코디 줄 카드(72x96, 3:4)와 같다. 배지는 높이 18, 11px 다.
const styles = StyleSheet.create({
  card: { width: 72, gap: 4 },
  photo: {
    width: 72,
    height: 96,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: STAGE_PINK,
  },
  photoOn: { borderWidth: 2, borderColor: CHERRY },
  fill: { width: "100%", height: "100%" },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", backgroundColor: "#EFEDEA" },
  cell: { width: "50%", height: "50%", padding: 3 },
  wearing: {
    position: "absolute",
    top: 4,
    left: 4,
    height: 18,
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: CHERRY,
  },
  wearingLabel: { color: "#fff", fontSize: 11, lineHeight: 18, fontWeight: "600" },
  badge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    height: 18,
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  badgeLabel: { color: "#151314", fontSize: 11, lineHeight: 18, fontWeight: "600" },
  title: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: "#151314" },
});

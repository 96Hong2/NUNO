import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export const CHERRY = "#D9304F";

export function formatPrice(priceKrw: number): string {
  return `${priceKrw.toLocaleString("ko-KR")}원`;
}

interface GarmentCardProps {
  name: string;
  thumbUri: string;
  /** 이름 아래 줄. 옷장은 브랜드, 홈은 종류다. */
  subline: string | null;
  priceKrw?: number | null;
  wanted: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** 「여러 벌 옮기기」 중이면 고른 여부, 아니면 undefined */
  selected?: boolean;
  onPress: () => void;
}

/** 옷장과 홈 「최근 넣은 옷」 의 옷 카드. 「담은 옷」 칸 옷에는 「담은 옷」 알약이 붙는다. */
export function GarmentCard(props: GarmentCardProps) {
  const { name, thumbUri, subline, priceKrw, wanted, favorite, selected } = props;
  // 별 단추는 카드 단추 안에 넣지 않고 형제로 겹친다. 웹에서 단추 안에 단추가 들면 안 된다.
  return (
    <View style={styles.wrap}>
      <Pressable
        role={selected === undefined ? "button" : "checkbox"}
        aria-checked={selected}
        aria-label={name}
        onPress={props.onPress}
        style={styles.card}
      >
        <View style={[styles.photo, selected && styles.photoSelected]}>
          <Image source={{ uri: thumbUri }} resizeMode="contain" style={styles.image} />
          {selected !== undefined ? (
            <View style={[styles.check, selected && styles.checkOn]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
          ) : null}
          {wanted ? (
            <View style={styles.pill}>
              <Text style={styles.pillLabel}>담은 옷</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {subline ? (
          <Text style={styles.subline} numberOfLines={1}>
            {subline}
          </Text>
        ) : null}
        {priceKrw ? <Text style={styles.price}>{formatPrice(priceKrw)}</Text> : null}
      </Pressable>
      {props.onToggleFavorite ? (
        <Pressable
          role="button"
          aria-label={favorite ? "즐겨찾기 풀기" : "즐겨찾기"}
          aria-pressed={favorite}
          hitSlop={8}
          onPress={props.onToggleFavorite}
          style={styles.star}
        >
          <Text style={styles.starIcon}>{favorite ? "★" : "☆"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  card: { gap: 4 },
  photo: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F7F7F7",
    borderWidth: 2,
    borderColor: "transparent",
  },
  photoSelected: { borderColor: CHERRY },
  image: { width: "100%", height: "100%" },
  check: {
    position: "absolute",
    left: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#9A9A9A",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { borderColor: CHERRY, backgroundColor: CHERRY },
  checkMark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  star: { position: "absolute", right: 8, top: 6 },
  starIcon: { fontSize: 20, color: "#151314" },
  pill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#FBE3E8",
  },
  pillLabel: { fontSize: 12, fontWeight: "600", color: CHERRY },
  name: { fontSize: 14, fontWeight: "600", color: "#151314", lineHeight: 19 },
  subline: { fontSize: 13, color: "#76736C" },
  price: { fontSize: 13, color: "#151314" },
});

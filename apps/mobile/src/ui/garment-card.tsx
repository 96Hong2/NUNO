import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { TagIcon } from "./line-icon";

export const CHERRY = "#B8233F";

const INK = "#151314";
const INK_2 = "#5F5C56";
const LINE = "#E7E6E3";
const PHOTO = "#EFEDEA";

export function formatPrice(priceKrw: number): string {
  return `${priceKrw.toLocaleString("ko-KR")}원`;
}

interface GarmentCardProps {
  name: string;
  thumbUri: string;
  /** 이름 아래 줄. 「내 옷」 칸은 「룩 N개에 썼어요」, 홈은 종류다. */
  subline: string | null;
  /** 「담은 옷」 칸의 가격과 판매처 한 줄 */
  priceKrw?: number | null;
  seller?: string | null;
  /** 사진 왼쪽 위 「담은 옷」 알약. 두 칸이 섞여 보이는 홈에서만 켠다 */
  wanted: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** 「여러 벌 옮기기」 중이면 고른 여부, 아니면 undefined. 고르는 동안 별은 숨긴다 */
  selected?: boolean;
  onPress: () => void;
}

/** 옷장과 홈 「최근 추가한 옷」 의 옷 카드 */
export function GarmentCard(props: GarmentCardProps) {
  const { name, thumbUri, subline, priceKrw, seller, wanted, favorite, selected } = props;
  const picking = selected !== undefined;
  // 별 단추는 카드 단추 안에 넣지 않고 형제로 겹친다. 웹에서 단추 안에 단추가 들면 안 된다.
  return (
    <View style={styles.wrap}>
      <Pressable
        role={picking ? "checkbox" : "button"}
        aria-checked={selected}
        aria-label={name}
        onPress={props.onPress}
      >
        <View testID="garment-photo" style={[styles.photo, selected && styles.photoSelected]}>
          {/* 누끼 그림은 칸 높이 80% 상자 가운데에 원본 비율로 둔다. */}
          <View style={styles.imageBox}>
            <Image source={{ uri: thumbUri }} resizeMode="contain" style={styles.image} />
          </View>
          {picking ? (
            <View style={[styles.check, selected && styles.checkOn]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
          ) : null}
          {wanted ? (
            <View style={styles.pill}>
              <TagIcon color={CHERRY} />
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
        {priceKrw || seller ? (
          <View style={styles.priceRow}>
            {priceKrw ? <Text style={styles.price}>{formatPrice(priceKrw)}</Text> : null}
            {seller ? (
              <Text style={styles.seller} numberOfLines={1}>
                {seller}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
      {props.onToggleFavorite && !picking ? (
        <Pressable
          role="button"
          aria-label={favorite ? "즐겨찾기 풀기" : "즐겨찾기"}
          aria-pressed={favorite}
          onPress={props.onToggleFavorite}
          style={styles.star}
        >
          <Text style={[styles.starIcon, favorite && styles.starOn]}>{favorite ? "★" : "☆"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  photo: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: PHOTO,
    alignItems: "center",
    justifyContent: "center",
  },
  photoSelected: { borderWidth: 2, borderColor: CHERRY },
  imageBox: { width: "80%", height: "80%" },
  image: { width: "100%", height: "100%" },
  check: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { borderColor: CHERRY, backgroundColor: CHERRY },
  checkMark: { color: "#fff", fontSize: 13, lineHeight: 16, fontWeight: "700" },
  // 별 아이콘 18 은 사진 오른쪽 위 안쪽 6 에 두고, 누르는 영역은 44×44 다.
  star: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 44,
    height: 44,
    alignItems: "flex-end",
    paddingTop: 4,
    paddingRight: 6,
  },
  starIcon: { fontSize: 18, lineHeight: 22, color: INK_2 },
  starOn: { color: INK },
  // 사진 왼쪽 위 안쪽 6, 높이 20 알약: 가격표 아이콘 10 과 11px 글자
  pill: {
    position: "absolute",
    left: 6,
    top: 6,
    height: 20,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    backgroundColor: "#F7E9EC",
  },
  pillLabel: { fontSize: 11, lineHeight: 14, fontWeight: "600", color: CHERRY },
  name: { marginTop: 8, fontSize: 13, fontWeight: "500", color: INK, lineHeight: 18 },
  subline: { marginTop: 4, fontSize: 12, lineHeight: 16, color: INK_2 },
  priceRow: { marginTop: 4, flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { fontSize: 13, fontWeight: "600", color: INK },
  seller: { flexShrink: 1, fontSize: 12, color: INK_2 },
});

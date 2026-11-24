import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { BookLook } from "../composition/lookbook";
import { BookLookImage } from "./book-look-image";

/** 표지 천 색. 테마와 상관없이 책 색으로 두고 책 순서대로 돌려 쓴다 */
const COVER_COLORS = ["#2B2A2E", "#6B4A35", "#2F3D52", "#6A2E3A", "#43513F", "#8A6A4E"];

/** 표지 사진 한 칸: 「모든 룩」 은 룩 그림, 서버 룩북은 서명 주소 사진 */
export type CoverPicture = { key: string; look: BookLook } | { key: string; url: string };

function Picture({ picture }: { picture: CoverPicture }) {
  return "look" in picture ? (
    <BookLookImage look={picture.look} />
  ) : (
    <Image source={{ uri: picture.url }} resizeMode="cover" style={styles.fill} />
  );
}

/** 사진 1~4장을 칸에 채운다. 한 장이면 칸을 다 채우고, 셋이면 왼쪽 한 장과 오른쪽 두 장이다 */
function Photos({ pictures }: { pictures: readonly CoverPicture[] }) {
  const cell = (picture: CoverPicture | undefined) =>
    picture ? (
      <View key={picture.key} style={styles.cell}>
        <Picture picture={picture} />
      </View>
    ) : null;
  const [a, b, c, d] = pictures;
  if (pictures.length <= 2) return <View style={styles.row}>{[cell(a), cell(b)]}</View>;
  if (pictures.length === 3) {
    return (
      <View style={styles.row}>
        {cell(a)}
        <View style={styles.column}>{[cell(b), cell(c)]}</View>
      </View>
    );
  }
  return (
    <View style={styles.column}>
      <View style={styles.row}>{[cell(a), cell(b)]}</View>
      <View style={styles.row}>{[cell(c), cell(d)]}</View>
    </View>
  );
}

/** 책장의 책 한 권. 표지 안에 룩 사진, 흰 글자 이름과 「룩 N개」. 비면 「아직 룩이 없어요」 */
export function BookCover({
  title,
  count,
  pictures,
  colorIndex,
  note,
  onPress,
}: {
  title: string;
  count: number;
  pictures: readonly CoverPicture[];
  colorIndex: number;
  /** 표지 아래 회색 한 줄(「기본 룩북」) */
  note?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      aria-label={`${title} 룩북 보기, 룩 ${count}개`}
      onPress={onPress}
      style={styles.book}
    >
      <View
        style={[styles.cover, { backgroundColor: COVER_COLORS[colorIndex % COVER_COLORS.length] }]}
      >
        <View style={styles.spine} />
        <View style={styles.frame}>
          {pictures.length > 0 ? (
            <Photos pictures={pictures.slice(0, 4)} />
          ) : (
            <View style={styles.emptyFrame}>
              <Text style={styles.emptyText}>아직 룩이 없어요</Text>
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.count}>룩 {count}개</Text>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  book: { width: "48%", gap: 8 },
  cover: {
    aspectRatio: 3 / 4,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 22,
    paddingRight: 12,
    borderRadius: 10,
    overflow: "hidden",
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 12,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  frame: {
    flex: 1,
    padding: 3,
    borderRadius: 4,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  row: { flex: 1, flexDirection: "row", gap: 3 },
  column: { flex: 1, gap: 3 },
  cell: { flex: 1, overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
  emptyFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F7F7",
  },
  emptyText: { fontSize: 12, color: "#76736C" },
  title: { marginTop: 10, color: "#fff", fontSize: 16, fontWeight: "800" },
  count: { marginTop: 2, color: "#fff", fontSize: 12, opacity: 0.85 },
  note: { fontSize: 12, color: "#76736C" },
});

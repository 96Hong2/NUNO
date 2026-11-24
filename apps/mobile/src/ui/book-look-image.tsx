import { Image, StyleSheet, Text, View } from "react-native";
import type { BookLook } from "../composition/lookbook";
import { STAGE_PINK } from "./coordi-stage";
import { LookImage } from "./look-image";

/**
 * 룩북의 룩 그림. 기기 견본 룩은 기존 룩 그림, 서버 완성 룩은 서명 주소 사진이다.
 * badge 면 「✦ AI 생성」 을 붙인다. 기기 견본 룩은 착장 사진일 때만 붙는다.
 */
export function BookLookImage({
  look,
  badge = false,
  label,
}: {
  look: BookLook;
  badge?: boolean;
  label?: string;
}) {
  if (look.kind === "device") return <LookImage look={look.look} badge={badge} label={label} />;
  return (
    <View role="img" aria-label={label} style={styles.frame}>
      <Image source={{ uri: look.look.imageUrl }} resizeMode="cover" style={styles.fill} />
      {badge ? <AiBadge /> : null}
    </View>
  );
}

/** 사진 왼쪽 위 「✦ AI 생성」 */
export function AiBadge({ inline = false }: { inline?: boolean }) {
  return (
    <View style={[styles.badge, inline ? null : styles.badgeCorner]}>
      <Text style={styles.badgeLabel}>✦ AI 생성</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden", backgroundColor: STAGE_PINK },
  fill: { width: "100%", height: "100%" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(21,19,20,0.72)",
  },
  badgeCorner: { position: "absolute", top: 8, left: 8 },
  badgeLabel: { color: "#fff", fontSize: 11, fontWeight: "700" },
});

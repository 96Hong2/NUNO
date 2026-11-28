import { samplePiece, type SampleGarmentKey } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { buildCatalog } from "./coordi-catalog";
import { CoordiStage, STAGE_PINK } from "./coordi-stage";
import { ONBOARDING_LOOK_PHOTOS } from "./sample-assets";

/** 룩 그림에 필요한 것. 저장한 룩과 저장 전 4/4 의 룩이 같은 꼴이다 */
export interface LookPicture {
  twinKey: string;
  photoKey: string | null;
  items: readonly { sampleKey: string }[];
}

/** 착장 사진이 있는 룩인지(「AI 생성」 표시와 안내 문구가 이것으로 갈린다) */
export function hasLookPhoto(look: LookPicture): boolean {
  return Boolean(look.photoKey && ONBOARDING_LOOK_PHOTOS[look.photoKey]);
}

/** 사진 아래 안내 문구. AI 가 만들지 않은 겹친 그림에는 AI 문구를 붙이지 않는다 */
export function lookCaption(look: LookPicture): string {
  return hasLookPhoto(look)
    ? "AI 가 만든 예시예요"
    : "옷 그림을 겹쳐 본 예시예요";
}

/**
 * 룩 그림. 착장 사진이 있으면 사진, 없으면 그 룩의 트윈 위에 입은 옷을 겹친 무대 그림이다(지금 트윈이 아니다).
 * 홈 카드, 책 표지, 영수증 카드, 룩 크게 보기, 4/4 가 함께 쓴다.
 */
export function LookImage({
  look,
  badge = false,
  label,
}: {
  look: LookPicture;
  badge?: boolean;
  label?: string;
}) {
  const catalog = useMemo(() => new Map(buildCatalog([]).map((item) => [item.key, item])), []);
  const photo = look.photoKey ? ONBOARDING_LOOK_PHOTOS[look.photoKey] : undefined;
  return (
    <View role="img" aria-label={label} style={styles.frame}>
      {photo ? (
        <Image source={photo} resizeMode="cover" style={styles.fill} />
      ) : (
        <CoordiStage
          thumbnail
          twinKey={look.twinKey as PresetTwinKey}
          outfit={look.items.map((item) => samplePiece(item.sampleKey as SampleGarmentKey))}
          catalog={catalog}
        />
      )}
      {badge && photo ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>✦ AI 생성</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden", backgroundColor: STAGE_PINK },
  fill: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(21,19,20,0.72)",
  },
  badgeLabel: { color: "#fff", fontSize: 11, fontWeight: "700" },
});

import {
  defaultOutfit,
  RECOMMENDED_LOOKS,
  sameOutfit,
  samplePiece,
  type RecommendedLook,
} from "@nuno/outfit";
import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LOOK_PHOTOS } from "./sample-assets";

const INK = "#151314";
const SUB = "#5F5C56";
const PHOTO = "#EFEDEA";

/** 무대 트윈이 지금 서 있는 기본 코디는 빼고, 그 트윈의 NUNO 추천 코디를 목록 차례대로 */
function recoLooks(twinKey: string): RecommendedLook[] {
  const base = defaultOutfit(twinKey);
  return (RECOMMENDED_LOOKS[twinKey] ?? []).filter(
    (look) => !sameOutfit(look.items.map(samplePiece), base),
  );
}

interface HomeRecoStripProps {
  twinKey: string;
  /** 머리 줄 오른쪽 글자 단추(룩 칸 「코디하러 가기 ›」, 옷 칸 「+ 옷 추가」) */
  action: ReactNode;
  onPick: (look: RecommendedLook) => void;
}

/**
 * 홈 시트 칸이 비었을 때 빈 안내 대신 보이는 추천 코디 줄.
 * 1차 출시는 피팅룸 코디 탭 「추천 코디」 와 같은 NUNO 추천 코디를 쓴다. 2차 출시에서 다른 사용자의 공개 룩북이 더해진다.
 * 목록 이름에 「추천 코디」 를 넣지 않는다. 탭을 옮겨도 홈이 남아 코디 탭의 「추천 코디」 목록과 이름이 겹친다.
 */
export function HomeRecoStrip({ twinKey, action, onPick }: HomeRecoStripProps) {
  const looks = recoLooks(twinKey);
  return (
    <View>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>추천 코디</Text>
          <Text style={styles.sub}>다른 사람들의 코디에서 골랐어요</Text>
        </View>
        {action}
      </View>
      <View role="list" aria-label="홈 추천 목록">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {looks.map((look) => {
            const photo = LOOK_PHOTOS[look.key];
            return (
              <Pressable
                key={look.key}
                role="button"
                aria-label={`${look.name} 추천 코디 입히기`}
                onPress={() => onPick(look)}
                style={styles.card}
              >
                <View style={styles.photo}>
                  {photo ? <Image source={photo} resizeMode="cover" style={styles.fill} /> : null}
                  <View style={styles.badge}>
                    <Text style={styles.badgeLabel}>NUNO 추천</Text>
                  </View>
                </View>
                <Text numberOfLines={2} style={styles.name}>
                  {look.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// 크기는 시안 v2 홈 빈 상태: 머리 줄 52, 카드 104×139(3:4), 카드 사이 8, 좌우 16.
const styles = StyleSheet.create({
  head: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headText: { gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: INK },
  sub: { fontSize: 12, lineHeight: 16, color: SUB },
  strip: { paddingTop: 4, paddingHorizontal: 16, gap: 8 },
  card: { width: 104, gap: 6 },
  photo: { width: 104, height: 139, borderRadius: 8, overflow: "hidden", backgroundColor: PHOTO },
  fill: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    height: 18,
    paddingHorizontal: 6,
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  badgeLabel: { fontSize: 11, fontWeight: "600", color: INK },
  name: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: INK },
});

import type { Look } from "@nuno/lookbook";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadLookbook } from "../../../src/composition/lookbook";
import { LookImage } from "../../../src/ui/look-image";

// 피팅룸 「룩북」: 저장한 룩을 책장으로 보인다. 옷장 판에는 「모든 룩」 책 하나만 있다.
// 대표 룩, 공개 범위, 새 룩북은 프로필 공개가 생기는 판에서 더한다.
export default function LookbookScreen() {
  const router = useRouter();
  const [looks, setLooks] = useState<Look[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadLookbook().then((view) => setLooks(view.looks));
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
      <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
        룩북
      </Text>
      {looks === null ? null : looks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 저장한 룩이 없어요</Text>
          <Text style={styles.emptyBody}>코디는 피팅룸 「코디」 의 「내 코디」 에 저장해요</Text>
          <Pressable
            role="button"
            onPress={() => router.navigate("/fitting/coordi")}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonLabel}>코디하러 가기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.headTitle}>내 룩북 1권</Text>
            <Text style={styles.headHint}>누르면 룩을 크게 봐요</Text>
          </View>
          <View style={styles.shelf}>
            <Pressable
              role="button"
              aria-label={`모든 룩 룩북 보기, 룩 ${looks.length}개`}
              onPress={() => looks[0] && router.push(`/look/${looks[0].id}`)}
              style={styles.book}
            >
              <View style={styles.cover}>
                {looks.slice(0, 4).map((look) => (
                  <View key={look.id} style={styles.coverCell}>
                    <LookImage look={look} label={look.title} />
                  </View>
                ))}
                <View style={styles.coverText}>
                  <Text style={styles.coverTitle}>모든 룩</Text>
                  <Text style={styles.coverCount}>룩 {looks.length}개</Text>
                </View>
              </View>
              <Text style={styles.bookNote}>기본 룩북</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  hiddenHeading: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#151314" },
  emptyBody: { fontSize: 14, color: "#76736C", textAlign: "center" },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: "#151314",
  },
  emptyButtonLabel: { color: "#fff", fontSize: 14, fontWeight: "700" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  headTitle: { fontSize: 17, fontWeight: "700", color: "#151314" },
  headHint: { fontSize: 12, color: "#76736C" },
  shelf: { flexDirection: "row", gap: 12 },
  book: { width: "48%", gap: 6 },
  cover: {
    aspectRatio: 3 / 4,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    gap: 4,
    borderRadius: 14,
    backgroundColor: "#2F2A2C",
    overflow: "hidden",
  },
  coverCell: { width: "48%", height: "40%", overflow: "hidden", borderRadius: 6 },
  coverText: { position: "absolute", left: 12, bottom: 10 },
  coverTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  coverCount: { color: "#fff", fontSize: 12 },
  bookNote: { fontSize: 12, color: "#76736C" },
});

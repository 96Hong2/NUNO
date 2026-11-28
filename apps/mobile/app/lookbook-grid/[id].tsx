import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadBook, type BookView } from "../../src/composition/lookbook";
import { BookLookImage } from "../../src/ui/book-look-image";

/** 칸의 가장 좁은 가로 폭과 칸 사이. 390 폭에서 4열이다 */
const TILE_MIN = 88;
const GAP = 2;

/** 폭을 채우는 열 수와 칸 폭: CSS `repeat(auto-fill, minmax(88px, 1fr))` 와 같다 */
function gridOf(width: number) {
  const columns = Math.max(1, Math.floor((width + GAP) / (TILE_MIN + GAP)));
  return { columns, tile: (width - GAP * (columns - 1)) / columns };
}

// 룩북 전체 보기: 그 룩북의 룩을 격자로 보인다. id 는 `all`(「모든 룩」)이나 서버 룩북 ID 다.
// 칸을 누르면 룩북 크게 보기를 그 룩으로 연다. 그 화면의 「전체 보기」 는 `from=grid` 를 보고 이 화면으로 돌아온다.
export default function LookbookGridScreen() {
  const { id = "all" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<BookView | null | "missing">(null);
  const [width, setWidth] = useState(0);
  // 서명 주소 기한이 지나 사진이 열리지 않으면 한 번만 다시 읽는다.
  const refetched = useRef(false);

  const reload = useCallback(async () => {
    setView((await loadBook(id)) ?? "missing");
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/fitting/lookbook"));
  const title = view && view !== "missing" ? `${view.title} 전체 보기` : "";

  const top = (
    <View style={styles.top}>
      <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text role="heading" aria-level={1} style={styles.topTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );

  if (view === null) return <View style={styles.screen}>{top}</View>;
  if (view === "missing") {
    return (
      <View style={styles.screen}>
        {top}
        <View style={styles.center}>
          <Text style={styles.muted}>이 룩북을 찾지 못했어요</Text>
          <Pressable role="button" onPress={back}>
            <Text style={styles.link}>룩북으로 돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const count = view.looks.length;
  const { columns, tile } = gridOf(width);
  const open = (key: string) =>
    router.push({ pathname: "/lookbook/[id]", params: { id, look: key, from: "grid" } });

  return (
    <View testID="lookbook-grid" style={styles.screen}>
      {top}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.count}>룩 {count}개</Text>
        <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {width > 0
            ? view.looks.map((look, index) => (
                <Pressable
                  key={look.key}
                  role="button"
                  aria-label={`${index + 1}번째 룩, ${look.title}`}
                  onPress={() => open(look.key)}
                  style={[
                    styles.tile,
                    { width: tile, marginRight: (index + 1) % columns === 0 ? 0 : GAP },
                  ]}
                >
                  <BookLookImage
                    look={look}
                    onError={() => {
                      if (refetched.current) return;
                      refetched.current = true;
                      void reload();
                    }}
                  />
                </Pressable>
              ))
            : null}
        </View>
        {count > 0 ? (
          <Text style={styles.done}>룩 {count}개를 모두 봤어요</Text>
        ) : (
          <Text style={styles.empty}>아직 룩이 없어요</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backIcon: { fontSize: 28, color: "#151314" },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#151314" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { fontSize: 14, color: "#5F5C56", textAlign: "center" },
  link: { fontSize: 14, fontWeight: "700", color: "#151314" },
  body: { paddingBottom: 24 },
  count: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
    fontSize: 13,
    color: "#5F5C56",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: GAP },
  tile: { aspectRatio: 3 / 4, overflow: "hidden", backgroundColor: "#E7E3DE" },
  done: {
    paddingTop: 18,
    paddingHorizontal: 16,
    textAlign: "center",
    fontSize: 13,
    color: "#5F5C56",
  },
  empty: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    textAlign: "center",
    fontSize: 14,
    color: "#5F5C56",
  },
});

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { canGenerateLooks } from "../../../src/composition/account";
import { createLookbook, loadShelf, type ShelfView } from "../../../src/composition/lookbook";
import { useAppToast } from "../../../src/ui/app-toast";
import { BookCover } from "../../../src/ui/book-cover";
import { NewLookbookSheet } from "../../../src/ui/lookbook-sheets";

/** 시트가 열려 있으면 알림을 화면 위쪽에 띄운다. 화면 아래에서 잰 거리는 화면 높이에서 이만큼 뺀 값이다 */
const TOAST_FROM_TOP = 140;

// 피팅룸 「룩북」: 저장한 룩을 책장으로 보인다. 첫 책은 「모든 룩」, 그다음 가입한 사용자의 서버 룩북들이다.
// 공개 범위와 「이름 바꾸기」 는 프로필 공개가 생기는 판에서 더한다.
export default function LookbookScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const overSheet = { bottom: useWindowDimensions().height - TOAST_FROM_TOP };
  const [shelf, setShelf] = useState<ShelfView | null>(null);
  const [creating, setCreating] = useState(false);
  const [generateOn, setGenerateOn] = useState(false);
  useEffect(() => {
    void canGenerateLooks().then(setGenerateOn, () => setGenerateOn(false));
  }, []);

  const reload = useCallback(() => void loadShelf().then(setShelf), []);
  useFocusEffect(reload);

  const create = async (title: string) => {
    const made = await createLookbook(title);
    if (!made) {
      toast.show("룩북을 만들지 못했어요. 잠시 뒤에 다시 해 주세요", undefined, overSheet);
      return;
    }
    setCreating(false);
    toast.show(`「${made.title}」 룩북을 만들었어요`);
    reload();
  };

  const empty = shelf !== null && shelf.allLooks.length === 0 && shelf.books.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
        <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
          룩북
        </Text>
        {shelf === null ? null : empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 저장한 룩이 없어요</Text>
            <Text style={styles.emptyBody}>
              {generateOn
                ? "코디를 입혀 보고 「이대로 입히기」 로 만든 룩을 룩북에 저장하면 여기에 보여요"
                : "코디는 피팅룸 「코디」 의 「내 코디」 에 저장해요"}
            </Text>
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
              <Text style={styles.headTitle}>내 룩북 {shelf.books.length}권</Text>
              <Text style={styles.headHint}>누르면 룩을 크게 봐요</Text>
            </View>
            <View style={styles.shelf}>
              <BookCover
                title="모든 룩"
                count={shelf.allLooks.length}
                pictures={shelf.allLooks.map((look) => ({ key: look.key, look }))}
                colorIndex={0}
                note="기본 룩북"
                onPress={() => router.push({ pathname: "/lookbook/[id]", params: { id: "all" } })}
              />
              {shelf.books.map((book, index) => (
                <BookCover
                  key={book.id}
                  title={book.title}
                  count={book.lookCount}
                  pictures={book.covers.map((url, n) => ({ key: `${book.id}:${n}`, url }))}
                  colorIndex={index + 1}
                  onPress={() =>
                    router.push({ pathname: "/lookbook/[id]", params: { id: book.id } })
                  }
                />
              ))}
              {shelf.signedIn ? (
                <Pressable role="button" onPress={() => setCreating(true)} style={styles.newBook}>
                  <View style={styles.newCover}>
                    <Text style={styles.newPlus}>+</Text>
                    <Text style={styles.newTitle}>새 룩북</Text>
                    <Text style={styles.newHint}>이름을 정해 만들어요</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
      <NewLookbookSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreate={(title) => void create(title)}
        notify={(message) => toast.show(message, undefined, overSheet)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: 16, paddingBottom: 32, gap: 14 },
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
  shelf: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18 },
  newBook: { width: "48%" },
  newCover: {
    aspectRatio: 3 / 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C9C6C0",
    backgroundColor: "#FAFAF9",
  },
  newPlus: { fontSize: 28, color: "#76736C" },
  newTitle: { fontSize: 15, fontWeight: "700", color: "#151314" },
  newHint: { fontSize: 12, color: "#76736C" },
});

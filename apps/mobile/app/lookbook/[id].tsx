import {
  bookPages,
  putBlockedMessage,
  putSheetRows,
  putSheetState,
  stepPage,
  type PutSheetRow,
} from "@nuno/lookbook";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  copyLook,
  createLookbook,
  loadBook,
  moveLook,
  setLookFavorite,
  type BookLook,
  type BookView,
} from "../../src/composition/lookbook";
import { useAppToast, type ToastAction } from "../../src/ui/app-toast";
import { AiBadge, BookLookImage } from "../../src/ui/book-look-image";
import { CHERRY } from "../../src/ui/garment-card";
import { withRo } from "../../src/ui/korean-particle";
import { NewLookbookSheet, PutLookSheet } from "../../src/ui/lookbook-sheets";

/** 시트가 열려 있으면 알림을 화면 위쪽에 띄운다. 화면 아래에서 잰 거리는 화면 높이에서 이만큼 뺀 값이다 */
const TOAST_FROM_TOP = 140;
/** 끝 쪽에서 더 넘기면 쪽 알약 글자가 바뀌어 있는 시간 */
const EDGE_MS = 1200;

/** 「「주말 데이트」로」: 조사는 이름 끝 글자로 고르고 낫표 밖에 붙인다 */
const quotedRo = (title: string) => `「${title}」${withRo(title).slice(title.length)}`;

// 룩북 크게 보기: id 는 `all`(「모든 룩」)이나 서버 룩북 ID 다. 룩을 한 장씩 넘겨 보고, 별과 「다른 룩북에 넣기」 를 쓴다.
// 기기 견본 룩(온보딩 「첫 코디」)은 별과 「다른 룩북에 넣기」 가 없고, 사진을 누르면 기존 룩 크게 보기를 연다.
export default function LookbookBookScreen() {
  const { id = "all", look: startKey } = useLocalSearchParams<{ id: string; look?: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const overSheet = { bottom: useWindowDimensions().height - TOAST_FROM_TOP };
  const [view, setView] = useState<BookView | null | "missing">(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(startKey ?? null);
  const [edge, setEdge] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"put" | "new" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(edgeTimer.current), []);

  const reload = useCallback(async () => {
    const loaded = await loadBook(id);
    setView(loaded ?? "missing");
    return loaded;
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/fitting/lookbook"));
  if (view === null) return <View style={styles.screen} />;
  if (view === "missing") {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>이 룩북을 찾지 못했어요</Text>
        <Pressable role="button" onPress={back}>
          <Text style={styles.link}>룩북으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const book = view;
  const pages = bookPages(book.looks, favoritesOnly);
  const found = pages.findIndex((item) => item.key === currentKey);
  const index = found < 0 ? 0 : found;
  const current: BookLook | undefined = pages[index];
  const favoriteCount = book.looks.filter((item) => item.isFavorite).length;
  const server = current?.kind === "server" ? current : null;
  const rows = server ? putSheetRows(book.books, book.id, server.look.inLookbooks) : [];
  const pickedRow = rows.find((row) => row.id === picked) ?? null;
  const sheetState = putSheetState(book.id === null ? null : book.title, pickedRow !== null);

  const notify = (message: string, actions?: ToastAction[]) =>
    toast.show(message, actions, sheet ? overSheet : undefined);

  /** 지금 룩이 목록에서 빠진 뒤 같은 자리의 룩을 연다 */
  const keepPosition = (next: readonly BookLook[]) =>
    setCurrentKey(next[Math.min(index, next.length - 1)]?.key ?? null);

  const step = (delta: 1 | -1) => {
    const moved = stepPage(index, pages.length, delta);
    if (moved.edge) {
      setEdge(moved.edge);
      clearTimeout(edgeTimer.current);
      edgeTimer.current = setTimeout(() => setEdge(null), EDGE_MS);
      return;
    }
    setCurrentKey(pages[moved.index]?.key ?? null);
  };

  const switchFavorites = (on: boolean) => {
    setFavoritesOnly(on);
    // 보던 룩이 새 목록에 있으면 그 자리, 없으면 첫 장이다.
    const next = bookPages(book.looks, on);
    if (!next.some((item) => item.key === currentKey)) setCurrentKey(next[0]?.key ?? null);
  };

  const toggleStar = async () => {
    if (!server || busy) return;
    const on = !server.isFavorite;
    setBusy(true);
    const ok = await setLookFavorite(server.key, on);
    setBusy(false);
    if (!ok) {
      notify("즐겨찾기를 바꾸지 못했어요. 잠시 뒤에 다시 해 주세요");
      return;
    }
    const looks = book.looks.map((item) =>
      item.kind === "server" && item.look.resultId === server.look.resultId
        ? { ...item, isFavorite: on, look: { ...item.look, isFavorite: on } }
        : item,
    );
    setView({ ...book, looks });
    // 「즐겨찾기만」 에서 별을 풀면 그 룩이 바로 빠진다.
    if (favoritesOnly && !on) keepPosition(bookPages(looks, true));
    notify(on ? "즐겨찾기에 넣었어요" : "즐겨찾기에서 뺐어요");
  };

  const openPut = () => {
    setPicked(null);
    setSheet("put");
  };

  const pick = (row: PutSheetRow) => {
    if (row.already) {
      notify(`이미 「${row.title}」 룩북에 있어요`);
      return;
    }
    setPicked(row.id);
  };

  const copy = async () => {
    const blocked = putBlockedMessage("copy", book.id === null ? null : book.title, !!pickedRow);
    if (blocked || !pickedRow || !server) {
      notify(blocked ?? "넣을 룩북을 먼저 골라 주세요");
      return;
    }
    if (busy) return;
    setBusy(true);
    const result = await copyLook(server.key, pickedRow.id);
    setBusy(false);
    if (!result.ok) {
      notify("룩북에 넣지 못했어요. 잠시 뒤에 다시 해 주세요");
      return;
    }
    setSheet(null);
    toast.show(
      result.already
        ? `이미 「${pickedRow.title}」 룩북에 있어요`
        : `「${pickedRow.title}」에도 넣었어요`,
    );
    void reload();
  };

  const undoMove = async (lookId: string, fromLookbookId: string) => {
    const result = await moveLook(lookId, fromLookbookId);
    if (!result.ok) {
      toast.show("되돌리지 못했어요. 잠시 뒤에 다시 해 주세요");
      return;
    }
    setCurrentKey(lookId);
    await reload();
    toast.show(`${quotedRo(book.title)} 되돌렸어요`);
  };

  const move = async () => {
    const blocked = putBlockedMessage("move", book.id === null ? null : book.title, !!pickedRow);
    if (blocked || !pickedRow || !server) {
      notify(blocked ?? "옮길 룩북을 먼저 골라 주세요");
      return;
    }
    if (busy) return;
    setBusy(true);
    const result = await moveLook(server.key, pickedRow.id);
    setBusy(false);
    if (!result.ok) {
      notify(
        result.error === "already_in_lookbook"
          ? `이미 「${pickedRow.title}」 룩북에 있어요`
          : "옮기지 못했어요. 잠시 뒤에 다시 해 주세요",
      );
      return;
    }
    setSheet(null);
    keepPosition(pages.filter((item) => item.key !== server.key));
    const lookId = server.key;
    toast.show(`「${pickedRow.title}」 룩북으로 옮겼어요`, [
      { label: "되돌리기", onPress: () => void undoMove(lookId, result.fromLookbookId) },
    ]);
    void reload();
  };

  const create = async (title: string) => {
    const made = await createLookbook(title);
    if (!made) {
      notify("룩북을 만들지 못했어요. 잠시 뒤에 다시 해 주세요");
      return;
    }
    // 만든 뒤 「다른 룩북에 넣기」 로 돌아와 새 룩북을 골라 둔다. 넣는 것은 사용자가 고른다.
    await reload();
    setPicked(made.id);
    setSheet("put");
    toast.show(`「${made.title}」 룩북을 만들었어요`, undefined, overSheet);
  };

  return (
    <View testID="lookbook-book" style={styles.screen}>
      <View style={styles.top}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text role="heading" aria-level={1} style={styles.topTitle} numberOfLines={1}>
          {book.title}
        </Text>
      </View>
      <View style={styles.chips}>
        <Pressable
          role="button"
          aria-pressed={!favoritesOnly}
          onPress={() => switchFavorites(false)}
          style={[styles.chip, !favoritesOnly && styles.chipOn]}
        >
          <Text style={[styles.chipLabel, !favoritesOnly && styles.chipLabelOn]}>
            전체 {book.looks.length}
          </Text>
        </Pressable>
        <Pressable
          role="button"
          aria-pressed={favoritesOnly}
          onPress={() => switchFavorites(true)}
          style={[styles.chip, favoritesOnly && styles.chipOn]}
        >
          <Text style={[styles.chipLabel, favoritesOnly && styles.chipLabelOn]}>
            즐겨찾기만 {favoriteCount}
          </Text>
        </Pressable>
      </View>

      {!current ? (
        favoritesOnly ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>즐겨찾기한 룩이 없어요</Text>
            <Text style={styles.muted}>룩 사진 오른쪽 위 별을 누르면 여기에 모여요</Text>
            <Pressable
              role="button"
              onPress={() => {
                setFavoritesOnly(false);
                setCurrentKey(book.looks[0]?.key ?? null);
              }}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonLabel}>전체 룩 보기</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 룩이 없어요</Text>
            <Text style={styles.muted}>
              「모든 룩」에서 룩을 크게 본 뒤 「다른 룩북에 넣기」를 누르면 여기에 모여요
            </Text>
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.photo}>
            <Pressable
              role={current.kind === "device" ? "button" : undefined}
              aria-label={current.kind === "device" ? `${current.title}, 입은 옷 보기` : undefined}
              disabled={current.kind !== "device"}
              onPress={() =>
                current.kind === "device" ? router.push(`/look/${current.look.id}`) : undefined
              }
              style={styles.fill}
            >
              <BookLookImage
                look={current}
                label={current.kind === "server" ? "완성 룩 사진" : current.title}
              />
            </Pressable>
            <View style={styles.photoTop} pointerEvents="box-none">
              <View style={styles.pill}>
                <Text style={styles.pillLabel}>{edge ?? `${index + 1} / ${pages.length}`}</Text>
              </View>
              {server ? <AiBadge inline /> : null}
            </View>
            {server ? (
              <Pressable
                role="button"
                aria-label={server.isFavorite ? "즐겨찾기 풀기" : "즐겨찾기"}
                onPress={() => void toggleStar()}
                style={styles.starHit}
              >
                <View style={styles.star}>
                  <Text style={[styles.starIcon, server.isFavorite && styles.starOn]}>
                    {server.isFavorite ? "★" : "☆"}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              role="button"
              aria-label="이전 룩"
              onPress={() => step(-1)}
              style={[styles.arrow, styles.arrowLeft, index === 0 && styles.arrowFaded]}
            >
              <Text style={styles.arrowIcon}>‹</Text>
            </Pressable>
            <Pressable
              role="button"
              aria-label="다음 룩"
              onPress={() => step(1)}
              style={[
                styles.arrow,
                styles.arrowRight,
                index === pages.length - 1 && styles.arrowFaded,
              ]}
            >
              <Text style={styles.arrowIcon}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>{current.title}</Text>
          {server ? (
            <View style={styles.actions}>
              <Pressable role="button" onPress={openPut} style={styles.action}>
                <Text style={styles.actionLabel}>다른 룩북에 넣기</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      <PutLookSheet
        visible={sheet === "put" && server !== null}
        lookTitle={current?.title ?? ""}
        rows={rows}
        picked={pickedRow?.id ?? null}
        state={sheetState}
        onPick={pick}
        onNew={() => setSheet("new")}
        onCopy={() => void copy()}
        onMove={() => void move()}
        onClose={() => setSheet(null)}
      />
      <NewLookbookSheet
        visible={sheet === "new"}
        onClose={() => setSheet("put")}
        onCreate={(title) => void create(title)}
        notify={notify}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backIcon: { fontSize: 28, color: "#151314" },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#151314" },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: "#F7F7F7" },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 14, fontWeight: "700", color: "#151314" },
  chipLabelOn: { color: "#fff" },
  body: { paddingHorizontal: 8, paddingBottom: 40, gap: 12 },
  photo: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 14 },
  fill: { flex: 1 },
  photoTop: { position: "absolute", top: 12, left: 10, flexDirection: "row", gap: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(21,19,20,0.72)",
  },
  pillLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  starHit: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#fff",
  },
  starIcon: { fontSize: 20, lineHeight: 22, color: "#151314" },
  starOn: { color: CHERRY },
  arrow: {
    position: "absolute",
    top: "50%",
    width: 40,
    height: 40,
    marginTop: -20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  arrowLeft: { left: 6 },
  arrowRight: { right: 6 },
  arrowFaded: { opacity: 0.45 },
  arrowIcon: { fontSize: 24, lineHeight: 26, color: "#151314" },
  title: { paddingHorizontal: 8, fontSize: 18, fontWeight: "800", color: "#151314" },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 8 },
  action: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: "#F7F7F7",
  },
  actionLabel: { fontSize: 14, fontWeight: "600", color: "#151314" },
  muted: { fontSize: 14, color: "#76736C", textAlign: "center" },
  link: { fontSize: 14, fontWeight: "700", color: "#151314" },
  empty: { alignItems: "center", gap: 8, paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#151314" },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F7F7F7",
  },
  emptyButtonLabel: { fontSize: 15, fontWeight: "700", color: "#151314" },
});

import {
  CLOSET_LABELS,
  closetFilter,
  closetFilterCount,
  filterGarments,
  GARMENT_CATEGORIES,
  isClosetKey,
  linkHost,
  lookUseLabel,
  NO_CLOSET_FILTER,
  type ClosetFilter,
  type ClosetKey,
  type GarmentFilter,
  type GarmentMethod,
} from "@nuno/wardrobe";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadGarmentLookCounts } from "../../../src/composition/lookbook";
import {
  loadCloset,
  moveToCloset,
  onClosetChange,
  toggleFavorite,
  type ClosetView,
} from "../../../src/composition/wardrobe";
import { AddGarmentSheet } from "../../../src/ui/add-garment-sheet";
import { useAppToast } from "../../../src/ui/app-toast";
import { ClosetFilterButton, ClosetFilterSheet } from "../../../src/ui/closet-filter-sheet";
import { GarmentCard } from "../../../src/ui/garment-card";
import { useStartGarment } from "../../../src/ui/use-start-garment";

const INK = "#151314";
const INK_2 = "#5F5C56";
const LINE = "#E7E6E3";
const SURFACE = "#F6F5F3";

const CLOSET_HINT: Record<ClosetKey, string> = {
  mine: "실제로 가진 옷이에요. 트윈에게 바로 입혀 볼 수 있어요",
  wanted: "사고 싶은 옷을 모아 두는 칸이에요. 산 옷은 옷 상세에서 내 옷으로 옮겨요",
};

const EMPTY_COPY: Record<ClosetKey, { title: string; hint: string }> = {
  mine: { title: "아직 추가한 옷이 없어요", hint: "옷 사진을 찍거나 앨범에서 골라 옷장에 넣어요" },
  wanted: {
    title: "아직 담은 옷이 없어요",
    hint: "사고 싶은 옷 사진을 찍거나 앨범에서 골라 담아 보세요",
  },
};

const ALL: GarmentFilter = { kind: "all" };

const sameFilter = (a: GarmentFilter, b: GarmentFilter) =>
  a.kind === b.kind &&
  (a.kind !== "category" || (b.kind === "category" && a.category === b.category));

const CHIPS: { key: string; label: string; filter: GarmentFilter }[] = [
  { key: "all", label: "전체", filter: ALL },
  ...GARMENT_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    filter: { kind: "category" as const, category: category.key },
  })),
];

// 피팅룸 「옷장」: 「내 옷」, 「담은 옷」 두 칸. 칸은 주소의 closet 값으로 연다.
// add=1 이면 「옷을 어떻게 추가할까요?」 시트를 연다(피팅룸 머리 줄 「+ 옷 추가」 가 쓴다).
// moving=1 이면 「여러 벌 옮기기」 중이다. 피팅룸 머리 줄이 이 값을 보고 「+ 옷 추가」 를 숨긴다.
// 종류 칩과 「거르기」 조건은 칸마다 따로 기억한다.
export default function ClosetScreen() {
  const params = useLocalSearchParams<{ closet?: string; add?: string; moving?: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const closet: ClosetKey = isClosetKey(params.closet) ? params.closet : "mine";
  const [view, setView] = useState<ClosetView | null>(null);
  const [lookCounts, setLookCounts] = useState<Record<string, number> | null>(null);
  const [lookCountsFailed, setLookCountsFailed] = useState(false);
  const [chipBy, setChipBy] = useState<Record<ClosetKey, GarmentFilter>>({
    mine: ALL,
    wanted: ALL,
  });
  const [filterBy, setFilterBy] = useState<Record<ClosetKey, ClosetFilter>>({
    mine: NO_CLOSET_FILTER,
    wanted: NO_CLOSET_FILTER,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const moving = params.moving === "1";
  const setMoving = (next: boolean) => router.setParams({ moving: next ? "1" : undefined });
  const [picked, setPicked] = useState<string[]>([]);
  const { start } = useStartGarment(closet);
  const chip = chipBy[closet];
  const filter = filterBy[closet];
  const filterCount = closetFilterCount(filter);

  const reload = useCallback(async () => {
    setView(await loadCloset(closet));
  }, [closet]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      // 룩 수는 서버 「모든 룩」 을 읽어 늦게 올 수 있다. 오기 전에는 카드 아래 줄을 비운다.
      setLookCountsFailed(false);
      loadGarmentLookCounts().then(setLookCounts, () => {
        setLookCounts(null);
        setLookCountsFailed(true);
      });
      return onClosetChange(() => void reload());
    }, [reload]),
  );

  const sheetOpen = params.add === "1";
  const closeSheet = () => router.setParams({ add: undefined });
  const openSheet = () => router.setParams({ add: "1" });

  const stopMoving = () => {
    setMoving(false);
    setPicked([]);
  };

  const switchCloset = (next: ClosetKey) => {
    setPicked([]);
    router.setParams({ closet: next, moving: undefined });
  };

  // 「사진 찍기」 는 1 / 4 안내 화면부터, 「앨범에서 고르기」 는 사진을 고른 뒤 2 / 4 부터 연다.
  const onPickMethod = (method: GarmentMethod) => {
    closeSheet();
    if (method === "camera")
      router.push({ pathname: "/garment/new/shoot", params: { from: closet } });
    else void start("album");
  };

  const flipFavorite = async (id: string, favorite: boolean) => {
    await toggleFavorite(id, !favorite);
    toast.show(favorite ? "즐겨찾기를 풀었어요" : "즐겨찾기했어요");
  };

  // 켜진 칩을 다시 누르면 「전체」 로 돌아간다. 고르던 옷은 비운다(안 보이는 옷까지 옮기지 않게).
  const pickChip = (next: GarmentFilter) => {
    setChipBy((current) => ({ ...current, [closet]: sameFilter(next, chip) ? ALL : next }));
    setPicked([]);
  };

  const applyFilter = (next: ClosetFilter) => {
    setFilterBy((current) => ({ ...current, [closet]: next }));
    setFilterOpen(false);
    setPicked([]);
  };

  const resetFilter = () => {
    setFilterBy((current) => ({ ...current, [closet]: NO_CLOSET_FILTER }));
    setChipBy((current) => ({ ...current, [closet]: ALL }));
    setPicked([]);
  };

  const moveToMine = async () => {
    const ids = picked;
    const moved = await moveToCloset(ids, "mine");
    stopMoving();
    toast.show(`${moved}벌을 내 옷으로 옮겼어요`, [
      { label: "되돌리기", onPress: () => void moveToCloset(ids, "wanted") },
    ]);
  };

  // 「룩에 안 쓴 옷」 을 켰는데 룩 수를 아직 못 읽었으면 거르지 않고 상태 글을 보인다(모든 옷이 룩 0개로 남지 않게).
  const countsMissing = filter.unusedOnly && lookCounts === null;
  const garments =
    view && !countsMissing
      ? closetFilter(filterGarments(view.garments, chip), filter, lookCounts ?? {})
      : [];
  const total = view?.counts[closet] ?? 0;
  const empty = view !== null && total === 0;

  return (
    <View style={styles.screen}>
      {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
      <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
        옷장
      </Text>
      <ScrollView contentContainerStyle={[styles.body, moving && styles.bodyMoving]}>
        <View style={styles.segment}>
          {(["mine", "wanted"] as const).map((key) => {
            const on = key === closet;
            const color = on ? INK : INK_2;
            return (
              <Pressable
                key={key}
                role="button"
                aria-pressed={on}
                aria-label={`${CLOSET_LABELS[key]} ${view?.counts[key] ?? 0}`}
                onPress={() => switchCloset(key)}
                style={StyleSheet.flatten([styles.segmentItem, on && styles.segmentOn])}
              >
                {key === "mine" ? <HangerIcon color={color} /> : <TagIcon color={color} />}
                <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>
                  {CLOSET_LABELS[key]}{" "}
                  <Text testID={`closet-count-${key}`}>{view?.counts[key] ?? 0}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{CLOSET_HINT[closet]}</Text>

        {empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{EMPTY_COPY[closet].title}</Text>
            <Text style={styles.emptyHint}>{EMPTY_COPY[closet].hint}</Text>
            <Pressable role="button" onPress={openSheet} style={styles.emptyButton}>
              <Text style={styles.emptyButtonLabel}>옷 추가</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.chipRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chips}
              >
                {CHIPS.map((item) => {
                  const on = sameFilter(item.filter, chip);
                  return (
                    <Pressable
                      key={item.key}
                      role="button"
                      aria-pressed={on}
                      onPress={() => pickChip(item.filter)}
                      style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
                    >
                      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ClosetFilterButton count={filterCount} onPress={() => setFilterOpen(true)} />
            </View>

            <View style={styles.countRow}>
              {moving ? (
                <>
                  <Text style={styles.pickedText}>{picked.length}벌 골랐어요</Text>
                  <Pressable role="button" hitSlop={12} onPress={stopMoving}>
                    <Text style={styles.textButton}>취소</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.countText}>{garments.length}벌</Text>
                  {closet === "wanted" ? (
                    <Pressable role="button" hitSlop={12} onPress={() => setMoving(true)}>
                      <Text style={styles.textButton}>여러 벌 옮기기</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>

            {view && countsMissing ? (
              <View style={styles.filteredEmpty}>
                <Text style={styles.filteredEmptyText}>
                  {lookCountsFailed ? "룩 수를 불러오지 못했어요" : "룩 수를 불러오는 중이에요"}
                </Text>
              </View>
            ) : view && garments.length === 0 ? (
              <View style={styles.filteredEmpty}>
                <Text style={styles.filteredEmptyText}>조건에 맞는 옷이 없어요</Text>
                {filterCount > 0 ? (
                  <Pressable role="button" onPress={resetFilter} style={styles.resetButton}>
                    <Text style={styles.resetLabel}>거르기 초기화</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.grid}>
                {garments.map((garment) => (
                  <View key={garment.id} style={styles.cell}>
                    <GarmentCard
                      name={garment.name}
                      thumbUri={garment.thumbUri}
                      subline={
                        closet === "mine" && lookCounts
                          ? lookUseLabel(lookCounts[garment.id] ?? 0)
                          : null
                      }
                      priceKrw={closet === "wanted" ? garment.priceKrw : null}
                      seller={
                        closet === "wanted"
                          ? (garment.brand ?? (garment.linkUrl ? linkHost(garment.linkUrl) : null))
                          : null
                      }
                      wanted={false}
                      favorite={garment.isFavorite}
                      onToggleFavorite={() => void flipFavorite(garment.id, garment.isFavorite)}
                      selected={moving ? picked.includes(garment.id) : undefined}
                      onPress={() =>
                        moving
                          ? setPicked((list) =>
                              list.includes(garment.id)
                                ? list.filter((id) => id !== garment.id)
                                : [...list, garment.id],
                            )
                          : router.push(`/garment/${garment.id}`)
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {moving ? (
        <View style={styles.footer}>
          <Pressable
            role="button"
            aria-disabled={picked.length === 0}
            onPress={() =>
              picked.length === 0 ? toast.show("옮길 옷을 골라 주세요") : void moveToMine()
            }
            style={StyleSheet.flatten([
              styles.moveButton,
              picked.length === 0 && styles.moveButtonOff,
            ])}
          >
            <Text style={[styles.moveLabel, picked.length === 0 && styles.moveLabelOff]}>
              {picked.length === 0
                ? "옮길 옷을 골라 주세요"
                : `${picked.length}벌 내 옷으로 옮기기`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ClosetFilterSheet
        visible={filterOpen}
        value={filter}
        onApply={applyFilter}
        onClose={() => setFilterOpen(false)}
      />
      <AddGarmentSheet
        visible={sheetOpen}
        counts={view ? { mine: view.counts.mine, wanted: view.counts.wanted } : null}
        onPick={onPickMethod}
        onClose={closeSheet}
      />
    </View>
  );
}

/** 「내 옷」 칸의 16 옷걸이: 고리와 세모 */
function HangerIcon({ color }: { color: string }) {
  return (
    <View style={styles.icon} aria-hidden>
      <View style={[styles.hangerHook, { borderColor: color }]} />
      <View style={[styles.hangerArm, styles.hangerArmLeft, { backgroundColor: color }]} />
      <View style={[styles.hangerArm, styles.hangerArmRight, { backgroundColor: color }]} />
      <View style={[styles.hangerBar, { backgroundColor: color }]} />
    </View>
  );
}

/** 「담은 옷」 칸의 16 가격표: 기운 네모와 구멍 */
function TagIcon({ color }: { color: string }) {
  return (
    <View style={styles.icon} aria-hidden>
      <View style={[styles.tagBody, { borderColor: color }]} />
      <View style={[styles.tagHole, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFBFA" },
  hiddenHeading: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  // 여러 벌 옮기기 중에는 목록 끝에 빈 자리 80 을 둔다.
  bodyMoving: { paddingBottom: 80 },
  segment: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  segmentItem: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  segmentOn: { borderBottomColor: INK },
  segmentLabel: { fontSize: 15, fontWeight: "500", color: INK_2 },
  segmentLabelOn: { fontWeight: "700", color: INK },
  hint: { marginTop: 8, fontSize: 13, lineHeight: 20, color: INK_2 },
  chipRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  chipScroll: { flex: 1 },
  chips: { gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  chipOn: { backgroundColor: INK },
  chipLabel: { fontSize: 14, fontWeight: "500", color: INK },
  chipLabelOn: { color: "#fff" },
  countRow: {
    marginTop: 12,
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countText: { fontSize: 13, color: INK_2 },
  pickedText: { fontSize: 13, fontWeight: "600", color: INK },
  textButton: { fontSize: 14, fontWeight: "600", color: INK },
  empty: { alignItems: "center", paddingTop: 112 },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: INK },
  emptyHint: {
    marginTop: 8,
    maxWidth: 200,
    fontSize: 14,
    lineHeight: 21,
    color: INK_2,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 20,
    width: 160,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
  },
  emptyButtonLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  grid: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, rowGap: 18 },
  cell: { width: "33.333%", paddingHorizontal: 4 },
  filteredEmpty: { alignItems: "center", gap: 16, paddingTop: 80 },
  filteredEmptyText: { fontSize: 16, fontWeight: "600", color: INK },
  resetButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  resetLabel: { fontSize: 15, fontWeight: "600", color: INK },
  // 아래 28 은 하단 탭 위로 솟은 피팅룸 얼굴 원이 단추를 가리지 않게 둔 여백이다.
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: "#fff",
  },
  moveButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: INK,
  },
  moveButtonOff: { backgroundColor: LINE },
  moveLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  moveLabelOff: { color: INK_2 },
  icon: { width: 16, height: 16 },
  hangerHook: {
    position: "absolute",
    left: 6,
    top: 0,
    width: 4,
    height: 4,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  hangerArm: { position: "absolute", top: 8, width: 8, height: 1.5, borderRadius: 1 },
  hangerArmLeft: { left: 1, transform: [{ rotate: "-35deg" }] },
  hangerArmRight: { right: 1, transform: [{ rotate: "35deg" }] },
  hangerBar: { position: "absolute", left: 0, right: 0, top: 11, height: 1.5, borderRadius: 1 },
  tagBody: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 10,
    height: 10,
    borderWidth: 1.5,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
  tagHole: { position: "absolute", left: 7, top: 5, width: 2, height: 2, borderRadius: 1 },
});

import {
  CLOSET_LABELS,
  filterGarments,
  GARMENT_CATEGORIES,
  isClosetKey,
  type ClosetKey,
  type GarmentFilter,
  type GarmentMethod,
} from "@nuno/wardrobe";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  loadCloset,
  moveToCloset,
  onClosetChange,
  toggleFavorite,
  type ClosetView,
} from "../../../src/composition/wardrobe";
import { AddGarmentSheet } from "../../../src/ui/add-garment-sheet";
import { useAppToast } from "../../../src/ui/app-toast";
import { CHERRY, GarmentCard } from "../../../src/ui/garment-card";
import { useStartGarment } from "../../../src/ui/use-start-garment";

const CLOSET_HINT: Record<ClosetKey, string> = {
  mine: "실제로 가진 옷이에요. 트윈에게 바로 입혀 볼 수 있어요",
  wanted: "아직 사지 않고 담아 둔 옷이에요. 산 옷은 상세에서 내 옷으로 옮겨요",
};

const sameFilter = (a: GarmentFilter, b: GarmentFilter) =>
  a.kind === b.kind &&
  (a.kind !== "category" || (b.kind === "category" && a.category === b.category));

// 피팅룸 「옷장」: 「내 옷」, 「담은 옷」 두 칸. 칸은 주소의 closet 값으로 연다(「옷장에서 보기」 가 쓴다).
// add=1 이면 「옷을 어떻게 넣을까요?」 시트를 연다(피팅룸 머리글 「+ 옷 추가」 가 쓴다).
export default function ClosetScreen() {
  const params = useLocalSearchParams<{ closet?: string; add?: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const closet: ClosetKey = isClosetKey(params.closet) ? params.closet : "mine";
  const [view, setView] = useState<ClosetView | null>(null);
  const [filter, setFilter] = useState<GarmentFilter>({ kind: "all" });
  const [moving, setMoving] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const { start } = useStartGarment(closet);

  const reload = useCallback(async () => {
    setView(await loadCloset(closet));
  }, [closet]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return onClosetChange(() => void reload());
    }, [reload]),
  );

  const sheetOpen = params.add === "1";
  const closeSheet = () => router.setParams({ add: undefined });
  const openSheet = () => router.setParams({ add: "1" });

  const switchCloset = (next: ClosetKey) => {
    setFilter({ kind: "all" });
    setMoving(false);
    setPicked([]);
    router.setParams({ closet: next });
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
    setFilter(sameFilter(next, filter) ? { kind: "all" } : next);
    setPicked([]);
  };

  const moveToMine = async () => {
    const ids = picked;
    const moved = await moveToCloset(ids, "mine");
    setMoving(false);
    setPicked([]);
    toast.show(`${moved}벌을 내 옷으로 옮겼어요`, [
      {
        label: "되돌리기",
        onPress: () => void moveToCloset(ids, "wanted"),
      },
      { label: "옷장에서 보기", onPress: () => switchCloset("mine") },
    ]);
  };

  const garments = view ? filterGarments(view.garments, filter) : [];
  const total = view?.counts[closet] ?? 0;
  const favorites = view?.counts.favorites[closet] ?? 0;
  const chips: { key: string; label: string; filter: GarmentFilter }[] = [
    { key: "favorite", label: `즐겨찾기 ${favorites}`, filter: { kind: "favorite" } },
    { key: "all", label: "전체", filter: { kind: "all" } },
    ...GARMENT_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      filter: { kind: "category" as const, category: category.key },
    })),
  ];

  return (
    <View style={styles.screen}>
      {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
      <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
        옷장
      </Text>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.segment}>
          {(["mine", "wanted"] as const).map((key) => {
            const on = key === closet;
            return (
              <Pressable
                key={key}
                role="button"
                aria-pressed={on}
                aria-label={`${CLOSET_LABELS[key]} ${view?.counts[key] ?? 0}`}
                onPress={() => switchCloset(key)}
                style={StyleSheet.flatten([styles.segmentItem, on && styles.segmentOn])}
              >
                <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>
                  {CLOSET_LABELS[key]}{" "}
                  <Text testID={`closet-count-${key}`} style={on ? styles.countOn : styles.count}>
                    {view?.counts[key] ?? 0}
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{CLOSET_HINT[closet]}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const on = sameFilter(chip.filter, filter);
            return (
              <Pressable
                key={chip.key}
                role="button"
                aria-pressed={on}
                onPress={() => pickChip(chip.filter)}
                style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.countRow}>
          <Text style={styles.countText}>{garments.length}벌</Text>
          {closet === "wanted" && total > 0 ? (
            <Pressable
              role="button"
              onPress={() => {
                setMoving(!moving);
                setPicked([]);
              }}
            >
              <Text style={styles.moveToggle}>{moving ? "그만 고르기" : "여러 벌 옮기기"}</Text>
            </Pressable>
          ) : null}
        </View>

        {view && total === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {closet === "mine" ? "아직 넣은 옷이 없어요" : "아직 담은 옷이 없어요"}
            </Text>
            {closet === "mine" ? (
              <Pressable role="button" onPress={openSheet} style={styles.emptyButton}>
                <Text style={styles.emptyButtonLabel}>옷 추가</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {closet === "mine" && !moving ? (
              <View style={styles.cell}>
                <Pressable
                  role="button"
                  aria-label="옷 추가"
                  onPress={openSheet}
                  style={styles.addCard}
                >
                  <Text style={styles.addPlus}>+</Text>
                  <Text style={styles.addLabel}>옷 추가</Text>
                </Pressable>
                <Text style={styles.addHint}>사진 찍기, 앨범</Text>
              </View>
            ) : null}
            {garments.length === 0 ? (
              <Text style={styles.filteredEmpty}>이 조건의 옷이 아직 없어요</Text>
            ) : null}
            {garments.map((garment) => (
              <View key={garment.id} style={styles.cell}>
                <GarmentCard
                  name={garment.name}
                  thumbUri={garment.thumbUri}
                  subline={garment.brand}
                  priceKrw={garment.priceKrw}
                  wanted={garment.closet === "wanted"}
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
              {picked.length === 0 ? "옮길 옷을 골라 주세요" : `내 옷으로 옮기기 ${picked.length}`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AddGarmentSheet
        visible={sheetOpen}
        counts={view ? { mine: view.counts.mine, wanted: view.counts.wanted } : null}
        onPick={onPickMethod}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFCFC" },
  hiddenHeading: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  body: { padding: 16, paddingBottom: 120, gap: 12 },
  segment: { flexDirection: "row", padding: 4, borderRadius: 14, backgroundColor: "#F2F1EF" },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11 },
  segmentOn: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6 },
  segmentLabel: { fontSize: 15, color: "#76736C", fontWeight: "600" },
  segmentLabelOn: { color: "#151314", fontWeight: "700" },
  count: { color: "#76736C" },
  countOn: { color: CHERRY },
  hint: { fontSize: 13, lineHeight: 19, color: "#76736C" },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#F2F1EF" },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 14, color: "#151314" },
  chipLabelOn: { color: "#fff", fontWeight: "600" },
  countRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  countText: { fontSize: 14, color: "#76736C" },
  moveToggle: { fontSize: 14, fontWeight: "700", color: "#151314" },
  empty: { alignItems: "center", gap: 16, paddingVertical: 40 },
  emptyText: { fontSize: 15, color: "#76736C" },
  emptyButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#151314",
  },
  emptyButtonLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, rowGap: 18 },
  cell: { width: "33.333%", paddingHorizontal: 5, gap: 6 },
  addCard: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#9A9A9A",
  },
  addPlus: { fontSize: 22, color: "#151314" },
  addLabel: { fontSize: 14, fontWeight: "700", color: "#151314" },
  addHint: { fontSize: 12, color: "#76736C" },
  filteredEmpty: {
    width: "100%",
    paddingHorizontal: 5,
    paddingTop: 12,
    fontSize: 14,
    color: "#76736C",
  },
  footer: { position: "absolute", left: 16, right: 16, bottom: 16 },
  moveButton: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#151314",
  },
  moveButtonOff: { backgroundColor: "#E7E6E3" },
  moveLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  moveLabelOff: { color: "#76736C" },
});

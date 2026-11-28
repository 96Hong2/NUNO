import {
  isWorn,
  outfitTitle,
  RECOMMENDED_LOOKS,
  refKey,
  sameOutfit,
  samplePiece,
  type Outfit,
  type OutfitCategory,
  type RecentOutfit,
} from "@nuno/outfit";
import { GARMENT_CATEGORIES } from "@nuno/wardrobe";
import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import type { CatalogItem } from "./coordi-catalog";
import { OutfitCard } from "./outfit-card";

export type StripTab = "recent" | "reco";

const INK = "#151314";
const INK_2 = "#5F5C56";
const CHERRY = "#B8233F";
const STEP_OFF = "rgba(95,92,86,0.4)";
const COLUMNS = 4;
const GAP = 8;

interface GarmentSheetProps {
  twinKey: string;
  outfit: Outfit;
  catalog: readonly CatalogItem[];
  catalogMap: ReadonlyMap<string, CatalogItem>;
  recents: readonly RecentOutfit[];
  category: OutfitCategory;
  onCategory: (category: OutfitCategory) => void;
  favoriteOnly: boolean;
  onFavoriteOnly: (on: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onStep: (direction: "undo" | "redo") => void;
  /** 코디 묶음(최근 입혀 본 코디, 추천 코디)을 보일지. 옷 칸을 올리거나 추천 창이 열리면 접는다 */
  showStrip: boolean;
  tab: StripTab;
  onTab: (tab: StripTab) => void;
  onWear: (item: CatalogItem) => void;
  onDetail: (item: CatalogItem) => void;
  onAdd: () => void;
  onPickOutfit: (outfit: Outfit, title: string) => void;
  /** 옷 목록 위에 끼우는 추천 결과 */
  suggestion?: ReactNode;
}

/** 입은 옷이 있는 종류 칩의 글자 뒤 체크(12px) */
function ChipCheck({ color }: { color: string }) {
  return (
    <View testID="worn-check" aria-hidden style={styles.checkBox}>
      <View style={[styles.checkStroke, { borderColor: color }]} />
    </View>
  );
}

/** 「↶」, 「↷」 24px 선 아이콘. 위쪽 화살촉에서 오른쪽으로 돌아 내려오는 굽은 화살이고, 다시 하기는 좌우를 뒤집는다 */
function StepIcon({ redo, color }: { redo: boolean; color: string }) {
  return (
    <View aria-hidden style={[styles.stepIcon, redo && styles.mirror]}>
      <View style={[styles.stepArc, { borderColor: color }]} />
      <View style={[styles.stepHead, { borderColor: color }]} />
    </View>
  );
}

/**
 * 무대 아래 옷 칸. 위쪽 종류 칩과 「전체, 즐겨찾기」, 「↶ ↷」 줄은 목록을 내려도 붙어 있고,
 * 그 아래로 코디 묶음, 추천 결과, 옷 격자가 넘어간다.
 */
export function CoordiGarmentSheet(props: GarmentSheetProps) {
  const { outfit, catalog, catalogMap, recents, category, favoriteOnly, twinKey } = props;
  const [gridWidth, setGridWidth] = useState(0);
  const nameOf = (piece: Outfit[number]) => catalogMap.get(refKey(piece.ref))?.shortName ?? "";
  const looks = (RECOMMENDED_LOOKS[twinKey] ?? []).map((look) => look.items.map(samplePiece));
  const tab = recents.length === 0 ? "reco" : props.tab;
  const strip = tab === "recent" ? recents.map((item) => item.outfit) : looks;
  const shown = catalog.filter(
    (item) => item.category === category && (!favoriteOnly || item.favorite),
  );
  // 지금 입은 옷은 「옷 추가」 바로 뒤 칸으로 올린다.
  const items = [
    ...shown.filter((item) => isWorn(outfit, item.ref)),
    ...shown.filter((item) => !isWorn(outfit, item.ref)),
  ];
  const cellSize = gridWidth > 0 ? (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const cell = cellSize > 0 ? { width: cellSize, height: cellSize } : styles.cellFallback;
  const onGridLayout = (event: LayoutChangeEvent) =>
    setGridWidth(Math.floor(event.nativeEvent.layout.width));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.chips}
        >
          <View role="group" aria-label="옷 종류" style={styles.chipRow}>
            {GARMENT_CATEGORIES.map((chip) => {
              const on = chip.key === category;
              const worn = outfit.some((piece) => piece.category === chip.key);
              return (
                <Pressable
                  key={chip.key}
                  role="button"
                  aria-pressed={on}
                  aria-label={worn ? `${chip.label}, 입은 옷 있음` : chip.label}
                  onPress={() => props.onCategory(chip.key)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{chip.label}</Text>
                  {worn ? <ChipCheck color={on ? "#fff" : INK} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.filterRow}>
          {[
            { on: !favoriteOnly, label: "전체", value: false },
            { on: favoriteOnly, label: "즐겨찾기", value: true },
          ].map((filter) => (
            <Pressable
              key={filter.label}
              role="button"
              aria-pressed={filter.on}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => props.onFavoriteOnly(filter.value)}
              style={styles.toggle}
            >
              <Text style={[styles.toggleLabel, filter.on && styles.toggleLabelOn]}>
                {filter.label}
              </Text>
              <View style={[styles.underline, filter.on && styles.underlineOn]} />
            </Pressable>
          ))}
          <View style={styles.flex} />
          <Pressable
            role="button"
            aria-label="이전 코디"
            aria-disabled={!props.canUndo}
            onPress={() => props.onStep("undo")}
            style={styles.stepButton}
          >
            <StepIcon redo={false} color={props.canUndo ? INK : STEP_OFF} />
          </Pressable>
          <Pressable
            role="button"
            aria-label="다음 코디"
            aria-disabled={!props.canRedo}
            onPress={() => props.onStep("redo")}
            style={styles.stepButton}
          >
            <StepIcon redo color={props.canRedo ? INK : STEP_OFF} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {props.showStrip ? (
          <View style={styles.stripBlock}>
            <View style={styles.tabs}>
              {recents.length > 0 ? (
                <Pressable
                  role="button"
                  aria-pressed={tab === "recent"}
                  onPress={() => props.onTab("recent")}
                >
                  <Text style={[styles.tab, tab === "recent" && styles.tabOn]}>
                    최근 입혀 본 코디
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                role="button"
                aria-pressed={tab === "reco"}
                onPress={() => props.onTab("reco")}
              >
                <Text style={[styles.tab, tab === "reco" && styles.tabOn]}>추천 코디</Text>
              </Pressable>
            </View>
            <View role="list" aria-label={tab === "recent" ? "최근 입혀 본 코디" : "추천 코디"}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.strip}
              >
                {strip.map((item, index) => {
                  const title = outfitTitle(item, nameOf);
                  return (
                    <OutfitCard
                      key={tab === "recent" ? (recents[index]?.id ?? index) : index}
                      title={title}
                      badge={tab === "recent" ? "내가 입혀 봄" : "NUNO 추천"}
                      wearing={sameOutfit(item, outfit)}
                      twinKey={twinKey}
                      outfit={item}
                      catalog={catalogMap}
                      onPress={() => props.onPickOutfit(item, title)}
                    />
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.divider} />
          </View>
        ) : null}

        {props.suggestion}

        {favoriteOnly && shown.length === 0 ? (
          <Text style={styles.empty}>즐겨찾기한 옷 가운데 이 종류가 없어요</Text>
        ) : null}
        <View role="list" aria-label="옷 목록" style={styles.grid} onLayout={onGridLayout}>
          <Pressable
            role="button"
            aria-label="옷장에 옷 추가"
            onPress={props.onAdd}
            style={[cell, styles.addCell]}
          >
            <Text style={styles.addPlus}>+</Text>
            <Text style={styles.addLabel}>옷 추가</Text>
          </Pressable>
          {items.map((item) => {
            const worn = isWorn(outfit, item.ref);
            return (
              <View key={item.key} style={cell}>
                <Pressable
                  role="button"
                  aria-pressed={worn}
                  aria-label={item.name}
                  onPress={() => props.onWear(item)}
                  style={[styles.photo, worn && styles.photoOn]}
                >
                  <Image source={item.thumb} resizeMode="contain" style={styles.thumb} />
                  {worn ? (
                    <View style={styles.wornMark}>
                      <Text style={styles.wornMarkLabel}>✓</Text>
                    </View>
                  ) : null}
                </Pressable>
                {item.sample ? null : (
                  <Pressable
                    role="button"
                    aria-label={`${item.name} 상세 보기`}
                    onPress={() => props.onDetail(item)}
                    style={styles.info}
                  >
                    <View style={styles.infoCircle}>
                      <Text style={styles.infoLabel}>i</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// 크기는 와이어프레임 v27 코디 옷 칸: 칩 높이 36, 필터 줄 36, 코디 카드 72x96, 옷 카드 네 열(390 폭에서 84).
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  flex: { flex: 1 },
  head: { paddingHorizontal: 16 },
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  chips: { paddingHorizontal: 16 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#F6F5F3",
  },
  chipOn: { backgroundColor: INK },
  chipLabel: { fontSize: 14, fontWeight: "500", color: INK },
  chipLabelOn: { color: "#fff", fontWeight: "600" },
  checkBox: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  checkStroke: {
    width: 8,
    height: 4.5,
    marginTop: -2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: "-45deg" }],
  },
  filterRow: { height: 36, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 16 },
  toggle: { height: 36, minWidth: 28, justifyContent: "center" },
  toggleLabel: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: INK_2 },
  toggleLabelOn: { fontWeight: "600", color: INK },
  underline: { position: "absolute", left: 0, right: 0, bottom: 4, height: 2 },
  underlineOn: { backgroundColor: INK },
  stepButton: {
    width: 44,
    height: 44,
    marginVertical: -4,
    marginLeft: -16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIcon: { width: 24, height: 24 },
  mirror: { transform: [{ scaleX: -1 }] },
  stepArc: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 13,
    height: 12,
    borderTopWidth: 1.75,
    borderRightWidth: 1.75,
    borderBottomWidth: 1.75,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  stepHead: {
    position: "absolute",
    left: 6.5,
    top: 3.6,
    width: 6.5,
    height: 6.5,
    borderLeftWidth: 1.75,
    borderBottomWidth: 1.75,
    transform: [{ rotate: "45deg" }],
  },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  stripBlock: { marginBottom: 8 },
  tabs: { height: 24, flexDirection: "row", alignItems: "center", gap: 16 },
  tab: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: INK_2 },
  tabOn: { color: INK, fontWeight: "600" },
  strip: { gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  divider: { height: 1, marginTop: 8, backgroundColor: "#E7E6E3" },
  empty: { marginBottom: 8, fontSize: 13, color: INK_2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  cellFallback: { width: "22%", aspectRatio: 1 },
  addCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#E7E6E3",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  addPlus: { fontSize: 20, lineHeight: 24, color: INK_2 },
  addLabel: { fontSize: 12, fontWeight: "500", color: INK_2 },
  photo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#EFEDEA",
  },
  photoOn: { borderWidth: 2, borderColor: CHERRY },
  thumb: { width: "80%", height: "80%" },
  wornMark: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: CHERRY,
  },
  wornMarkLabel: { color: "#fff", fontSize: 11, fontWeight: "700" },
  // (i) 는 누르는 영역 32x32 를 카드 오른쪽 아래 모서리에 붙인다. 보이는 원은 20 이다.
  info: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCircle: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  infoLabel: { fontSize: 12, fontWeight: "600", color: INK_2 },
});

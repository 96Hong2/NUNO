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
import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CatalogItem } from "./coordi-catalog";
import { CHERRY } from "./garment-card";
import { OutfitCard } from "./outfit-card";

export type StripTab = "recent" | "reco";

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
  tab: StripTab;
  onTab: (tab: StripTab) => void;
  onWear: (item: CatalogItem) => void;
  onDetail: (item: CatalogItem) => void;
  onFavorite: (item: CatalogItem) => void;
  onAdd: () => void;
  onPickOutfit: (outfit: Outfit, title: string) => void;
  /** 옷 목록 위에 끼우는 추천 결과 */
  suggestion?: ReactNode;
}

/** 무대 아래 옷 칸: 종류 칩, 거르기, 코디 줄, 옷 격자 */
export function CoordiGarmentSheet(props: GarmentSheetProps) {
  const { outfit, catalog, catalogMap, recents, category, favoriteOnly, twinKey } = props;
  const nameOf = (piece: Outfit[number]) => catalogMap.get(refKey(piece.ref))?.shortName ?? "";
  const looks = (RECOMMENDED_LOOKS[twinKey] ?? []).map((look) => look.items.map(samplePiece));
  const tab = recents.length === 0 ? "reco" : props.tab;
  const strip = tab === "recent" ? recents.map((item) => item.outfit) : looks;
  const items = catalog.filter(
    (item) => item.category === category && (!favoriteOnly || item.favorite),
  );
  return (
    <View style={styles.wrap}>
      <View role="group" aria-label="옷 종류" style={styles.chips}>
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
              {worn ? <View testID="worn-dot" style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.filters}>
        {[
          { on: !favoriteOnly, label: "전체", value: false },
          { on: favoriteOnly, label: "즐겨찾기만", value: true },
        ].map((filter) => (
          <Pressable
            key={filter.label}
            role="button"
            aria-pressed={filter.on}
            onPress={() => props.onFavoriteOnly(filter.value)}
            style={[styles.filter, filter.on && styles.chipOn]}
          >
            <Text style={[styles.filterLabel, filter.on && styles.chipLabelOn]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tabs}>
        {recents.length > 0 ? (
          <Pressable
            role="button"
            aria-pressed={tab === "recent"}
            onPress={() => props.onTab("recent")}
          >
            <Text style={[styles.tab, tab === "recent" && styles.tabOn]}>최근 입혀 본 코디</Text>
          </Pressable>
        ) : null}
        <Pressable role="button" aria-pressed={tab === "reco"} onPress={() => props.onTab("reco")}>
          <Text style={[styles.tab, tab === "reco" && styles.tabOn]}>추천 코디</Text>
        </Pressable>
      </View>
      <View role="list" aria-label={tab === "recent" ? "최근 입혀 본 코디" : "추천 코디"}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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

      {props.suggestion}

      {favoriteOnly && items.length === 0 ? (
        <Text style={styles.empty}>즐겨찾기한 옷 가운데 이 종류가 없어요</Text>
      ) : null}
      <View role="list" aria-label="옷 목록" style={styles.grid}>
        <Pressable
          role="button"
          aria-label="내 옷 사진으로 옷장에 추가"
          onPress={props.onAdd}
          style={[styles.cell, styles.addCell]}
        >
          <Text style={styles.addPlus}>+</Text>
          <Text style={styles.addLabel}>옷장에 추가</Text>
        </Pressable>
        {items.map((item) => {
          const worn = isWorn(outfit, item.ref);
          return (
            <View key={item.key} style={styles.cell}>
              <Pressable
                role="button"
                aria-pressed={worn}
                aria-label={item.name}
                onPress={() => props.onWear(item)}
                style={[styles.photo, worn && styles.photoOn]}
              >
                <Image source={item.thumb} resizeMode="contain" style={styles.fill} />
                {worn ? (
                  <View style={styles.check}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
              {item.sample ? null : (
                <>
                  <Pressable
                    role="button"
                    aria-label={item.favorite ? "즐겨찾기 빼기" : "즐겨찾기"}
                    hitSlop={6}
                    onPress={() => props.onFavorite(item)}
                    style={styles.star}
                  >
                    <Text style={[styles.starIcon, item.favorite && styles.starOn]}>
                      {item.favorite ? "★" : "☆"}
                    </Text>
                  </Pressable>
                  <Pressable
                    role="button"
                    aria-label={`${item.name} 상세 보기`}
                    hitSlop={6}
                    onPress={() => props.onDetail(item)}
                    style={styles.info}
                  >
                    <Text style={styles.infoIcon}>ⓘ</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  fill: { width: "100%", height: "100%" },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#F4F3F1",
  },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 13, color: "#151314" },
  chipLabelOn: { color: "#fff", fontWeight: "700" },
  dot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CHERRY,
  },
  filters: { flexDirection: "row", gap: 6 },
  filter: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#F4F3F1",
  },
  filterLabel: { fontSize: 12, color: "#151314" },
  tabs: { flexDirection: "row", gap: 14 },
  tab: { fontSize: 14, color: "#9A968E" },
  tabOn: { color: "#151314", fontWeight: "700" },
  strip: { gap: 8 },
  empty: { fontSize: 13, color: "#76736C" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "23%", aspectRatio: 1 },
  addCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C9C6C0",
    borderRadius: 12,
  },
  addPlus: { fontSize: 18, color: "#76736C" },
  addLabel: { fontSize: 11, color: "#76736C" },
  photo: { flex: 1, padding: 6, borderRadius: 12, backgroundColor: "#F4F3F1" },
  photoOn: { borderWidth: 2, borderColor: CHERRY },
  check: {
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
  checkMark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  star: { position: "absolute", left: 4, bottom: 2 },
  starIcon: { fontSize: 15, color: "#9A968E" },
  starOn: { color: CHERRY },
  info: { position: "absolute", right: 4, bottom: 2 },
  infoIcon: { fontSize: 14, color: "#76736C" },
});

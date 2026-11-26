import { closetFilterCount, NO_CLOSET_FILTER, SEASONS, type ClosetFilter } from "@nuno/wardrobe";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OverlaySheet } from "./overlay-sheet";

const INK = "#151314";
const INK_2 = "#5F5C56";
const LINE = "#E7E6E3";
const SURFACE = "#F6F5F3";

interface ClosetFilterSheetProps {
  visible: boolean;
  /** 지금 걸린 조건. 시트를 열 때 이 값에서 시작한다 */
  value: ClosetFilter;
  onApply: (next: ClosetFilter) => void;
  onClose: () => void;
}

/**
 * 옷장 「거르기」 시트. 「즐겨찾기」, 「룩에 안 쓴 옷」 스위치와 「계절」 칩을 고르고 「적용」 을 눌러야 목록이 바뀐다.
 * 「초기화」 는 시트 안의 고른 값만 비운다.
 */
export function ClosetFilterSheet({ visible, value, onApply, onClose }: ClosetFilterSheetProps) {
  const [draft, setDraft] = useState<ClosetFilter>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const toggleSeason = (key: ClosetFilter["seasons"][number]) =>
    setDraft((current) => ({
      ...current,
      seasons: current.seasons.includes(key)
        ? current.seasons.filter((season) => season !== key)
        : [...current.seasons, key],
    }));

  return (
    <OverlaySheet visible={visible} title="거르기" onClose={onClose}>
      <SwitchRow
        title="즐겨찾기"
        hint="별을 누른 옷만 보여요"
        on={draft.favoriteOnly}
        onToggle={() => setDraft((current) => ({ ...current, favoriteOnly: !current.favoriteOnly }))}
      />
      <SwitchRow
        title="룩에 안 쓴 옷"
        hint="저장한 룩에 한 번도 안 들어간 옷만 보여요"
        on={draft.unusedOnly}
        onToggle={() => setDraft((current) => ({ ...current, unusedOnly: !current.unusedOnly }))}
      />
      <View style={styles.seasonBlock}>
        <Text style={styles.rowTitle}>계절</Text>
        <Text style={styles.rowHint}>여러 개를 고를 수 있어요</Text>
        <View role="group" aria-label="계절" style={styles.seasons}>
          {SEASONS.map((season) => {
            const on = draft.seasons.includes(season.key);
            return (
              <Pressable
                key={season.key}
                role="checkbox"
                aria-checked={on}
                aria-label={season.label}
                onPress={() => toggleSeason(season.key)}
                style={StyleSheet.flatten([styles.seasonChip, on && styles.seasonChipOn])}
              >
                <Text style={[styles.seasonLabel, on && styles.seasonLabelOn]}>{season.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          role="button"
          onPress={() => setDraft(NO_CLOSET_FILTER)}
          style={styles.reset}
          aria-disabled={closetFilterCount(draft) === 0}
        >
          <Text style={styles.resetLabel}>초기화</Text>
        </Pressable>
        <Pressable role="button" onPress={() => onApply(draft)} style={styles.apply}>
          <Text style={styles.applyLabel}>적용</Text>
        </Pressable>
      </View>
    </OverlaySheet>
  );
}

function SwitchRow(props: { title: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      role="switch"
      aria-checked={props.on}
      aria-label={props.title}
      onPress={props.onToggle}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.rowHint}>{props.hint}</Text>
      </View>
      <View style={[styles.track, props.on && styles.trackOn]}>
        <View style={[styles.knob, props.on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

/** 칩 줄 오른쪽 끝에 고정하는 「거르기」 단추. 켠 조건이 있으면 「거르기 N」 이다 */
export function ClosetFilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const label = count > 0 ? `거르기 ${count}` : "거르기";
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={StyleSheet.flatten([styles.filterButton, count > 0 && styles.filterButtonOn])}
    >
      <FilterIcon />
      <Text style={styles.filterLabel}>{label}</Text>
    </Pressable>
  );
}

/** 16 칸 거르기 아이콘: 가로줄 둘과 손잡이 원 둘 */
function FilterIcon() {
  return (
    <View style={styles.icon} aria-hidden>
      <View style={[styles.iconLine, { top: 4 }]} />
      <View style={[styles.iconKnob, { top: 1.5, left: 8.5 }]} />
      <View style={[styles.iconLine, { top: 11 }]} />
      <View style={[styles.iconKnob, { top: 8.5, left: 3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: INK },
  rowHint: { fontSize: 13, lineHeight: 19, color: INK_2 },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    backgroundColor: LINE,
    justifyContent: "center",
  },
  trackOn: { backgroundColor: INK },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    boxShadow: "0px 1px 2px rgba(21,19,20,0.2)",
  },
  knobOn: { alignSelf: "flex-end" },
  seasonBlock: { gap: 4 },
  seasons: { flexDirection: "row", gap: 8, marginTop: 10 },
  seasonChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  seasonChipOn: { backgroundColor: INK },
  seasonLabel: { fontSize: 14, fontWeight: "500", color: INK },
  seasonLabelOn: { color: "#fff" },
  actions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  reset: { height: 52, paddingHorizontal: 16, justifyContent: "center" },
  resetLabel: { fontSize: 15, fontWeight: "600", color: INK },
  apply: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
  },
  applyLabel: { fontSize: 16, fontWeight: "600", color: "#fff" },
  filterButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterButtonOn: { borderColor: INK },
  filterLabel: { fontSize: 14, fontWeight: "500", color: INK },
  icon: { width: 16, height: 16 },
  iconLine: {
    position: "absolute",
    left: 1,
    right: 1,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: INK,
  },
  iconKnob: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: "#fff",
  },
});

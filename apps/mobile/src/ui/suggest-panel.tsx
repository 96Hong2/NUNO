import { categoryLabel } from "@nuno/wardrobe";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogItem } from "./coordi-catalog";

export type SuggestScope = "closet" | "favorite";

const SCOPES: { key: SuggestScope; label: string }[] = [
  { key: "closet", label: "옷장에 있는 옷" },
  { key: "favorite", label: "즐겨찾기한 옷" },
];

/** 고른 범위의 옷 수. 즐겨찾기한 옷은 옷장 옷 안에 있다. */
export function scopeCount(scopes: readonly SuggestScope[], counts: Record<SuggestScope, number>) {
  if (scopes.includes("closet")) return counts.closet;
  return scopes.includes("favorite") ? counts.favorite : 0;
}

interface SuggestRangeProps {
  visible: boolean;
  counts: Record<SuggestScope, number>;
  onSubmit: (scopes: SuggestScope[]) => void;
  onBlocked: (message: string) => void;
}

/** 무대 「추천 코디」 를 누르면 무대 위에 뜨는 범위 창. 범위는 옷장과 즐겨찾기 둘만 둔다. */
export function SuggestRange({ visible, counts, onSubmit, onBlocked }: SuggestRangeProps) {
  const [scopes, setScopes] = useState<SuggestScope[]>(["closet"]);
  useEffect(() => {
    if (visible) setScopes(["closet"]);
  }, [visible]);
  if (!visible) return null;
  const total = scopeCount(scopes, counts);
  const label =
    scopes.length === 0
      ? "하나 이상 골라 주세요"
      : total === 0
        ? "고른 곳에 옷이 없어요"
        : `${total}벌에서 추천 받기`;
  const ready = scopes.length > 0 && total > 0;
  const submit = () => {
    if (scopes.length === 0) onBlocked("하나 이상 골라 주세요");
    else if (total === 0) onBlocked("고른 곳에 추천할 옷이 없어요");
    else onSubmit(scopes);
  };
  return (
    <View role="dialog" aria-label="추천 범위" style={styles.box}>
      <Text style={styles.hint}>어떤 옷에서 추천할까요? 여러 개 고를 수 있어요</Text>
      <View style={styles.chips}>
        {SCOPES.map((scope) => {
          const on = scopes.includes(scope.key);
          return (
            <Pressable
              key={scope.key}
              role="checkbox"
              aria-checked={on}
              onPress={() =>
                setScopes(on ? scopes.filter((s) => s !== scope.key) : [...scopes, scope.key])
              }
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                {on ? "✓ " : ""}
                {scope.label} {counts[scope.key]}벌
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable role="button" onPress={submit} style={[styles.submit, !ready && styles.submitOff]}>
        <Text style={[styles.submitLabel, !ready && styles.submitLabelOff]}>{label}</Text>
      </Pressable>
    </View>
  );
}

interface SuggestPanelProps {
  picks: readonly CatalogItem[];
  scopes: readonly SuggestScope[];
  onWear: (item: CatalogItem) => void;
  onRetry: () => void;
  onClose: () => void;
}

/** 옷 목록 위 「지금 코디에 어울리는 옷」 결과. 「입어보기」 를 눌러야 입는다. */
export function SuggestPanel({ picks, scopes, onWear, onRetry, onClose }: SuggestPanelProps) {
  const from = scopes.includes("closet") ? "옷장에 있는 옷" : "즐겨찾기한 옷";
  return (
    <View role="region" aria-label="지금 코디에 어울리는 옷" style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.flex}>
          <Text style={styles.panelTitle}>지금 코디에 어울리는 옷</Text>
          <Text style={styles.panelSub}>{from}에서 골랐어요</Text>
        </View>
        <Pressable role="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryLabel}>↻ 다시 추천</Text>
        </Pressable>
        <Pressable role="button" aria-label="추천 닫기" hitSlop={10} onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.picks}>
        {picks.length === 0 ? (
          <Text style={styles.panelSub}>더 어울리는 옷을 찾지 못했어요</Text>
        ) : (
          picks.map((item) => (
            <View key={item.key} style={styles.pick}>
              <View style={styles.pickPhoto}>
                <Image source={item.thumb} resizeMode="contain" style={styles.fill} />
              </View>
              <Text style={styles.pickCategory}>{categoryLabel(item.category)}</Text>
              <Text style={styles.pickName} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable
                role="button"
                aria-label={`${item.name} 입어보기`}
                onPress={() => onWear(item)}
                style={styles.wear}
              >
                <Text style={styles.wearLabel}>입어보기</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      <Text style={styles.panelNote}>「입어보기」를 눌러야 트윈이 입어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: "100%", height: "100%" },
  box: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 56,
    zIndex: 10,
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  hint: { fontSize: 13, color: "#76736C" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: "#F4F3F1" },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 13, color: "#151314" },
  chipLabelOn: { color: "#fff", fontWeight: "700" },
  submit: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#151314",
  },
  submitOff: { backgroundColor: "#E7E6E3" },
  submitLabel: { color: "#fff", fontSize: 14, fontWeight: "700" },
  submitLabelOff: { color: "#76736C" },
  panel: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: "#F8F7F5" },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  panelTitle: { fontSize: 15, fontWeight: "700", color: "#151314" },
  panelSub: { fontSize: 12, color: "#76736C" },
  retry: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "#fff" },
  retryLabel: { fontSize: 12, color: "#151314" },
  close: { fontSize: 16, color: "#151314" },
  picks: { flexDirection: "row", gap: 8 },
  pick: { flex: 1, gap: 3 },
  pickPhoto: { aspectRatio: 1, padding: 6, borderRadius: 10, backgroundColor: "#fff" },
  pickCategory: { fontSize: 11, color: "#76736C" },
  pickName: { fontSize: 12, color: "#151314" },
  wear: { alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: "#E7E6E3" },
  wearLabel: { fontSize: 12, fontWeight: "600", color: "#151314" },
  panelNote: { fontSize: 11, color: "#76736C" },
});

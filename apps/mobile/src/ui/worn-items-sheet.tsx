import { wornSheetState } from "@nuno/lookbook";
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { CHERRY } from "./garment-card";
import { OverlaySheet } from "./overlay-sheet";

/** 입은 옷 시트의 한 줄 */
export interface WornSheetRow {
  key: string;
  name: string;
  /** 체크 상자 이름에 쓰는 긴 이름. 없으면 name */
  fullName?: string;
  categoryLabel: string;
  image: ImageSourcePropType | null;
  inCloset: boolean;
  /** 이 휴대폰에서 고를 수 없는 까닭. 있으면 체크 상자를 그리지 않는다 */
  unavailable?: string;
}

interface WornItemsSheetProps {
  visible: boolean;
  rows: readonly WornSheetRow[];
  picked: readonly string[];
  onPick: (keys: string[]) => void;
  /** 「옷장에 담기」. 고른 줄이 없거나 모두 옷장에 있으면 부르지 않고 onNotice 로 알린다 */
  onKeep: () => void;
  /** 「트윈에 입혀 보기 N」. 고른 줄이 없으면 부르지 않는다 */
  onWear: () => void;
  onNotice: (message: string) => void;
  onClose: () => void;
}

/**
 * 룩의 입은 옷 시트: 옷마다 체크 상자, 그림, 종류, 이름, 「옷장에 있음」. 아래 「옷장에 담기」 와 「트윈에 입혀 보기」.
 * 룩 크게 보기와 룩북 크게 보기가 함께 쓴다.
 */
export function WornItemsSheet(props: WornItemsSheetProps) {
  const { rows, picked, onPick, onNotice } = props;
  const choosable = rows.filter((row) => !row.unavailable).map((row) => row.key);
  const allPicked = choosable.length > 0 && picked.length === choosable.length;
  const missing = rows.filter((row) => picked.includes(row.key) && !row.inCloset).length;
  const state = wornSheetState(picked.length, missing);

  const keep = () => {
    if (picked.length === 0) onNotice("담을 옷을 먼저 골라 주세요");
    else if (missing === 0) onNotice("고른 옷은 이미 옷장에 있어요");
    else props.onKeep();
  };
  const wear = () => {
    if (picked.length === 0) onNotice("입혀 볼 옷을 먼저 골라 주세요");
    else props.onWear();
  };

  return (
    <OverlaySheet
      visible={props.visible}
      title={`입은 옷 ${rows.length}개`}
      onClose={props.onClose}
      headerAction={
        <Pressable
          role="button"
          onPress={() => onPick(allPicked ? [] : choosable)}
          style={styles.pickAll}
        >
          <Text style={styles.pickAllLabel}>{allPicked ? "모두 풀기" : "모두 고르기"}</Text>
        </Pressable>
      }
    >
      {rows.map((row) => {
        const on = picked.includes(row.key);
        return (
          <View key={row.key} style={styles.row}>
            {row.unavailable ? (
              <View style={styles.boxSpace} />
            ) : (
              <Pressable
                role="checkbox"
                aria-checked={on}
                aria-label={`${row.fullName ?? row.name} 고르기`}
                onPress={() =>
                  onPick(on ? picked.filter((key) => key !== row.key) : [...picked, row.key])
                }
                style={[styles.box, on && styles.boxOn]}
              >
                {on ? <Text style={styles.boxMark}>✓</Text> : null}
              </Pressable>
            )}
            <View style={styles.rowPhoto}>
              {row.image ? (
                <Image source={row.image} resizeMode="contain" style={styles.fill} />
              ) : null}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.muted}>{row.categoryLabel}</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {row.name}
              </Text>
              {row.unavailable ? <Text style={styles.muted}>{row.unavailable}</Text> : null}
              {!row.unavailable && row.inCloset ? (
                <Text style={styles.inCloset}>옷장에 있음</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <Text style={styles.line}>{state.line}</Text>
      <View style={styles.sheetButtons}>
        <Pressable
          role="button"
          onPress={keep}
          style={[styles.half, state.closet.active ? styles.outline : styles.idle]}
        >
          <Text style={[styles.halfLabel, !state.closet.active && styles.idleLabel]}>
            {state.closet.label}
          </Text>
        </Pressable>
        <Pressable
          role="button"
          onPress={wear}
          style={[styles.half, state.wear.active ? styles.cherry : styles.idle]}
        >
          <Text style={[styles.halfLabel, state.wear.active ? styles.white : styles.idleLabel]}>
            {state.wear.label}
          </Text>
        </Pressable>
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  muted: { fontSize: 12, color: "#5F5C56" },
  itemName: { fontSize: 13, fontWeight: "600", color: "#151314" },
  pickAll: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#F4F3F1",
  },
  pickAllLabel: { fontSize: 12, color: "#151314" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  box: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#C9C6C0",
  },
  boxSpace: { width: 22 },
  boxOn: { borderColor: CHERRY, backgroundColor: CHERRY },
  boxMark: { color: "#fff", fontSize: 13, fontWeight: "800" },
  rowPhoto: { width: 52, height: 52, padding: 4, borderRadius: 8, backgroundColor: "#F4F3F1" },
  rowText: { flex: 1, gap: 2 },
  inCloset: { fontSize: 12, fontWeight: "700", color: CHERRY },
  line: { fontSize: 13, color: "#5F5C56" },
  sheetButtons: { flexDirection: "row", gap: 8 },
  half: { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12 },
  outline: { borderWidth: 1.5, borderColor: "#151314", backgroundColor: "#fff" },
  cherry: { backgroundColor: CHERRY },
  idle: { backgroundColor: "#E7E6E3" },
  halfLabel: { fontSize: 14, fontWeight: "700", color: "#151314" },
  white: { color: "#fff" },
  idleLabel: { color: "#5F5C56" },
});

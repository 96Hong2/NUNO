import { LOOKBOOK_TITLE_MAX, type PutSheetRow, type PutSheetState } from "@nuno/lookbook";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CHERRY } from "./garment-card";
import { OverlaySheet } from "./overlay-sheet";

const INK = "#151314";
const SUB = "#5F5C56";
const LINE = "#E7E6E3";
const CARD = "#F6F5F3";

/** 줄 왼쪽 책 아이콘. plus 면 책 안에 「+」 */
function BookIcon({ plus = false }: { plus?: boolean }) {
  return (
    <View style={styles.bookIcon}>{plus ? <Text style={styles.bookPlus}>+</Text> : null}</View>
  );
}

/**
 * 「새 룩북 만들기」 시트. 책장의 「새 룩북」 카드와 「다른 룩북에 넣기」 시트가 함께 쓴다.
 * 이름은 12자에서 잘린다. 비어 있으면 「만들기」 가 회색이고 누르면 알림을 띄운다.
 */
export function NewLookbookSheet({
  visible,
  onClose,
  onCreate,
  notify,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (visible) setName("");
  }, [visible]);
  const title = name.trim();
  return (
    <OverlaySheet visible={visible} title="새 룩북 만들기" onClose={onClose} hideClose>
      <View style={styles.field}>
        <TextInput
          aria-label="룩북 이름"
          value={name}
          onChangeText={setName}
          maxLength={LOOKBOOK_TITLE_MAX}
          placeholder="예: 출근룩, 데이트"
          placeholderTextColor="#A9A6A0"
          autoFocus
          style={styles.input}
        />
        <Text style={styles.hint}>12자까지 적을 수 있어요</Text>
      </View>
      <Pressable
        role="button"
        aria-disabled={title === ""}
        onPress={() => (title === "" ? notify("룩북 이름을 적어 주세요") : onCreate(title))}
        style={[styles.create, title === "" && styles.createOff]}
      >
        <Text style={[styles.createLabel, title === "" && styles.offLabel]}>만들기</Text>
      </Pressable>
      <Pressable role="button" onPress={onClose} style={styles.textButton}>
        <Text style={styles.textButtonLabel}>닫기</Text>
      </Pressable>
    </OverlaySheet>
  );
}

/**
 * 「다른 룩북에 넣기」 시트. 줄과 단추 상태는 lookbook 도메인 putSheetRows, putSheetState 가 정한다.
 * 고르기 전 두 단추는 회색이어도 눌린다. 부르는 쪽이 putBlockedMessage 로 알림을 띄운다.
 */
export function PutLookSheet({
  visible,
  lookTitle,
  rows,
  picked,
  state,
  onPick,
  onNew,
  onCopy,
  onMove,
  onClose,
}: {
  visible: boolean;
  lookTitle: string;
  rows: readonly PutSheetRow[];
  picked: string | null;
  state: PutSheetState;
  onPick: (row: PutSheetRow) => void;
  onNew: () => void;
  onCopy: () => void;
  onMove: () => void;
  onClose: () => void;
}) {
  return (
    <OverlaySheet visible={visible} title="다른 룩북에 넣기" onClose={onClose}>
      <Text style={styles.subtitle} numberOfLines={1}>
        {lookTitle}
      </Text>
      <ScrollView style={styles.rows}>
        {rows.map((row) => {
          const on = picked === row.id;
          return (
            <Pressable
              key={row.id}
              role="radio"
              aria-checked={on}
              aria-label={`${row.title}, ${row.meta}`}
              onPress={() => onPick(row)}
              style={styles.row}
            >
              <BookIcon />
              <Text style={styles.rowTitle} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={styles.rowMeta}>{row.meta}</Text>
              {row.already ? null : (
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <View style={styles.radioDot} /> : null}
                </View>
              )}
            </Pressable>
          );
        })}
        <Pressable role="button" onPress={onNew} style={[styles.row, styles.lastRow]}>
          <BookIcon plus />
          <Text style={styles.rowTitle}>새 룩북 만들기</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.divider} />
      <Text style={styles.note}>{state.note}</Text>
      <View style={styles.buttons}>
        <Pressable
          role="button"
          aria-disabled={!state.copyReady}
          onPress={onCopy}
          style={[styles.half, styles.copy]}
        >
          <Text style={[styles.halfLabel, !state.copyReady && styles.offLabel]}>복사해서 넣기</Text>
        </Pressable>
        <Pressable
          role="button"
          aria-disabled={!state.moveReady}
          onPress={onMove}
          style={[styles.half, state.moveReady ? styles.moveOn : styles.moveOff]}
        >
          <Text style={[styles.halfLabel, state.moveReady ? styles.white : styles.offLabel]}>
            옮기기
          </Text>
        </Pressable>
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD,
    fontSize: 16,
    color: INK,
  },
  hint: { fontSize: 12, color: SUB },
  create: { alignItems: "center", paddingVertical: 15, borderRadius: 12, backgroundColor: INK },
  createOff: { backgroundColor: LINE },
  createLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  textButton: { alignItems: "center", paddingVertical: 6 },
  textButtonLabel: { fontSize: 14, color: SUB },
  subtitle: { marginTop: -12, fontSize: 13, color: SUB },
  rows: { maxHeight: 280 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LINE,
  },
  lastRow: { borderBottomWidth: 0 },
  bookIcon: {
    width: 15,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderLeftWidth: 3,
    borderRadius: 2,
    borderColor: "#4A4744",
  },
  bookPlus: { fontSize: 12, lineHeight: 13, fontWeight: "700", color: "#4A4744" },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: INK },
  rowMeta: { fontSize: 13, color: SUB },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: LINE,
  },
  radioOn: { borderColor: CHERRY, borderWidth: 2 },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: CHERRY },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -20,
    backgroundColor: LINE,
  },
  note: { fontSize: 12, lineHeight: 18, color: SUB },
  buttons: { flexDirection: "row", gap: 8 },
  half: { flex: 1, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  copy: { backgroundColor: CARD },
  moveOn: { backgroundColor: INK },
  moveOff: { backgroundColor: LINE },
  halfLabel: { fontSize: 15, fontWeight: "700", color: INK },
  white: { color: "#fff" },
  offLabel: { color: SUB },
});

import { SAVED_SLOTS, type Outfit, type SavedOutfit } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { lookPhotoOf, type CatalogItem } from "./coordi-catalog";
import { CoordiStage, STAGE_PINK } from "./coordi-stage";
import { CHERRY } from "./garment-card";
import { OverlaySheet } from "./overlay-sheet";
import { TWIN_ASSETS } from "./twin-assets";

interface Common {
  saved: readonly SavedOutfit[];
  catalog: ReadonlyMap<string, CatalogItem>;
}

/** 내 코디 칸 작은 그림: 그 칸을 담은 트윈이 그 코디를 입은 모습 */
function SavedThumb({ saved, catalog }: { saved: SavedOutfit; catalog: Common["catalog"] }) {
  return (
    <CoordiStage
      thumbnail
      twinKey={saved.twinKey as PresetTwinKey}
      outfit={saved.outfit}
      catalog={catalog}
    />
  );
}

interface MyOutfitsSheetProps extends Common {
  visible: boolean;
  twinKey: PresetTwinKey;
  today: { title: string; outfit: Outfit } | null;
  onClose: () => void;
  onSave: () => void;
  onLoad: (saved: SavedOutfit) => void;
  onToday: () => void;
  onMenu: (saved: SavedOutfit) => void;
}

/** 무대 「내 코디」 시트: 「오늘 뭐 입지」 카드와 다섯 칸 */
export function MyOutfitsSheet(props: MyOutfitsSheetProps) {
  const { saved, catalog, today, twinKey } = props;
  const slots = Array.from({ length: SAVED_SLOTS }, (_, index) =>
    saved.find((item) => item.slot === index + 1),
  );
  const todayPhoto = today ? lookPhotoOf(twinKey, today.outfit) : undefined;
  return (
    <OverlaySheet
      visible={props.visible}
      title="내 코디"
      onClose={props.onClose}
      headerAction={
        <Pressable role="button" onPress={props.onSave} style={styles.saveButton}>
          <Text style={styles.saveLabel}>지금 코디 담기</Text>
        </Pressable>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {today ? (
          <Pressable
            role="button"
            aria-label={`오늘 뭐 입지, ${today.title}`}
            onPress={props.onToday}
            style={styles.today}
          >
            <View style={styles.todayPhoto}>
              <Image
                source={todayPhoto ?? TWIN_ASSETS[twinKey].base}
                resizeMode="cover"
                style={styles.fill}
              />
            </View>
            <View style={styles.todayText}>
              <Text style={styles.todayTitle}>오늘 뭐 입지</Text>
              <Text style={styles.todaySub} numberOfLines={3}>
                {today.title}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {slots.map((item, index) =>
          item ? (
            <View key={item.id} style={styles.slot}>
              <Pressable
                role="button"
                aria-label={`${item.title} 입히기`}
                onPress={() => props.onLoad(item)}
                style={styles.slotPhoto}
              >
                <SavedThumb saved={item} catalog={catalog} />
              </Pressable>
              <Pressable
                role="button"
                aria-label={`${item.title} 메뉴`}
                onPress={() => props.onMenu(item)}
                style={styles.menu}
              >
                <Text style={styles.menuLabel}>…</Text>
              </Pressable>
              <Text style={styles.slotTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ) : (
            <View key={`empty-${index}`} style={styles.slot}>
              <Pressable
                role="button"
                aria-label="빈 칸에 지금 코디 담기"
                onPress={props.onSave}
                style={[styles.slotPhoto, styles.empty]}
              >
                <Text style={styles.plus}>+</Text>
              </Pressable>
              <Text style={styles.slotTitle}> </Text>
            </View>
          ),
        )}
      </ScrollView>
    </OverlaySheet>
  );
}

interface FullSheetProps extends Common {
  visible: boolean;
  onClose: () => void;
  onOverwrite: (slot: number) => void;
}

/** 다섯 칸이 다 찬 뒤 담으려 할 때: 덮어쓸 칸을 고른다 */
export function SavedFullSheet({ visible, saved, catalog, onClose, onOverwrite }: FullSheetProps) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) setPicked(null);
  }, [visible]);
  return (
    <OverlaySheet visible={visible} title="내 코디 5칸이 다 찼어요" onClose={onClose}>
      <View role="radiogroup" aria-label="덮어쓸 칸" style={styles.fullRow}>
        {saved.map((item) => (
          <Pressable
            key={item.id}
            role="radio"
            aria-checked={picked === item.slot}
            aria-label={`${item.slot}번 칸 ${item.title}`}
            onPress={() => setPicked(item.slot)}
            style={[styles.fullCard, picked === item.slot && styles.fullCardOn]}
          >
            <SavedThumb saved={item} catalog={catalog} />
          </Pressable>
        ))}
      </View>
      <Pressable
        role="button"
        aria-disabled={picked === null}
        onPress={() => picked !== null && onOverwrite(picked)}
        style={[styles.primary, picked === null && styles.primaryOff]}
      >
        <Text style={[styles.primaryLabel, picked === null && styles.primaryLabelOff]}>
          이 칸에 덮어쓰기
        </Text>
      </Pressable>
      <Text style={styles.note}>덮어쓴 코디는 되돌릴 수 없어요</Text>
    </OverlaySheet>
  );
}

interface MenuSheetProps {
  saved: SavedOutfit | null;
  onClose: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/** 내 코디 칸의 「…」: 이름 바꾸기와 지우기 */
export function SavedMenuSheet({ saved, onClose, onRename, onDelete }: MenuSheetProps) {
  const [title, setTitle] = useState("");
  useEffect(() => setTitle(saved?.title ?? ""), [saved]);
  return (
    <OverlaySheet visible={saved !== null} title={saved?.title ?? ""} onClose={onClose}>
      <View style={styles.renameRow}>
        <TextInput
          aria-label="코디 이름"
          value={title}
          onChangeText={setTitle}
          maxLength={30}
          style={styles.input}
        />
        <Pressable
          role="button"
          onPress={() => title.trim() && onRename(title.trim())}
          style={styles.renameButton}
        >
          <Text style={styles.primaryLabel}>이름 바꾸기</Text>
        </Pressable>
      </View>
      <Pressable role="button" onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteLabel}>지우기</Text>
      </Pressable>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#151314",
  },
  saveLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  row: { gap: 10, paddingBottom: 4 },
  today: {
    width: 196,
    height: 128,
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#F4F3F1",
  },
  todayPhoto: { width: 74, overflow: "hidden", borderRadius: 10, backgroundColor: STAGE_PINK },
  todayText: { flex: 1, gap: 4, justifyContent: "center" },
  todayTitle: { fontSize: 14, fontWeight: "700", color: "#151314" },
  todaySub: { fontSize: 12, lineHeight: 17, color: "#76736C" },
  slot: { width: 82, gap: 4 },
  slotPhoto: { width: 82, height: 110, overflow: "hidden", borderRadius: 12 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C9C6C0",
  },
  plus: { fontSize: 24, color: "#9A968E" },
  menu: {
    position: "absolute",
    left: 4,
    top: 82,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  menuLabel: { fontSize: 13, fontWeight: "700", color: "#151314" },
  slotTitle: { fontSize: 11, color: "#151314" },
  fullRow: { flexDirection: "row", gap: 8 },
  fullCard: { flex: 1, height: 104, overflow: "hidden", borderRadius: 10 },
  fullCardOn: { borderWidth: 2, borderColor: CHERRY },
  primary: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#151314",
  },
  primaryOff: { backgroundColor: "#E7E6E3" },
  primaryLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  primaryLabelOff: { color: "#76736C" },
  note: { fontSize: 12, color: "#76736C", textAlign: "center" },
  renameRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E7E6E3",
    fontSize: 15,
  },
  renameButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#151314",
  },
  deleteButton: { alignItems: "center", paddingVertical: 12 },
  deleteLabel: { fontSize: 15, color: CHERRY, fontWeight: "600" },
});

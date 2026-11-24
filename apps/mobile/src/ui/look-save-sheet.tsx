import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LookImage, lookCaption, type LookPicture } from "./look-image";
import { OverlaySheet } from "./overlay-sheet";

interface LookSaveSheetProps {
  visible: boolean;
  look: Omit<LookPicture, "items"> & { items: readonly { sampleKey: string; name: string }[] };
  /** 영수증 맨 아래 「@<이름>의 <날짜> 코디」 의 이름. 없으면 「내 트윈」 */
  owner: string | null;
  date: { short: string; long: string };
  saving: boolean;
  onSave: (title: string) => void;
  onClose: () => void;
}

/**
 * 「룩북 저장」 시트. 옷장 판 몫만 둔다: 영수증 카드, 제목 칸, 「내 룩북에 저장」.
 * 피드 올리기, 태그, 협찬, 가격, 카드 비율, 고화질은 피드와 결제가 생기는 판에서 더한다.
 */
export function LookSaveSheet(props: LookSaveSheetProps) {
  const { visible, look, owner, date, saving } = props;
  // 시트를 닫았다 다시 열어도 고친 제목을 남긴다.
  const [title, setTitle] = useState("첫 코디");
  return (
    <OverlaySheet visible={visible} title="룩북 저장" onClose={props.onClose}>
      <View style={styles.receipt}>
        <View style={styles.receiptHead}>
          <Text style={styles.receiptTitle}>OUTFIT RECEIPT</Text>
          <Text style={styles.muted}>{date.short}</Text>
        </View>
        <View style={styles.receiptBody}>
          <View style={styles.photoColumn}>
            <View style={styles.photo}>
              <LookImage look={look} label={`${title || "첫 코디"} 사진`} />
            </View>
            <Text style={styles.caption}>{lookCaption(look)}</Text>
          </View>
          <View style={styles.lines}>
            <Text style={styles.lookTitle} numberOfLines={2}>
              {title || "첫 코디"}
            </Text>
            {look.items.map((item) => (
              <Text key={item.sampleKey} style={styles.line} numberOfLines={2}>
                {item.name}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.receiptFoot}>
          <Text style={styles.muted}>
            {owner ? `@${owner}` : "내 트윈"}의 {date.long} 코디
          </Text>
          <Text style={styles.brand}>NUNO</Text>
        </View>
      </View>
      <Text style={styles.label}>제목</Text>
      <TextInput
        aria-label="제목"
        value={title}
        onChangeText={setTitle}
        maxLength={30}
        style={styles.input}
      />
      <Pressable
        role="button"
        aria-disabled={saving}
        onPress={() => !saving && props.onSave(title.trim() || "첫 코디")}
        style={styles.save}
      >
        <Text style={styles.saveLabel}>내 룩북에 저장</Text>
      </Pressable>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  receipt: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E7E6E3" },
  receiptHead: { flexDirection: "row", justifyContent: "space-between" },
  receiptTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 2, color: "#151314" },
  receiptBody: { flexDirection: "row", gap: 12 },
  photoColumn: { width: 120, gap: 4 },
  photo: { width: 120, height: 160, overflow: "hidden", borderRadius: 10 },
  caption: { fontSize: 10, lineHeight: 14, color: "#76736C" },
  lines: { flex: 1, gap: 8 },
  lookTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#151314",
    textDecorationLine: "underline",
  },
  line: { fontSize: 13, color: "#151314" },
  receiptFoot: { flexDirection: "row", justifyContent: "space-between" },
  muted: { fontSize: 12, color: "#76736C" },
  brand: { fontSize: 12, fontWeight: "800", color: "#151314" },
  label: { fontSize: 13, fontWeight: "700", color: "#151314" },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F4F3F1",
    fontSize: 15,
  },
  save: { alignItems: "center", paddingVertical: 15, borderRadius: 12, backgroundColor: "#151314" },
  saveLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

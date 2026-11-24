import { PRESET_TWINS, type PresetTwinKey } from "@nuno/twin";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { TWIN_ASSETS } from "./twin-assets";

interface TwinSwitchSheetProps {
  visible: boolean;
  current: PresetTwinKey;
  onPick: (key: PresetTwinKey) => void;
  onClose: () => void;
}

/** 홈 「트윈 바꾸기」 시트. 프리셋 여섯을 둥근 얼굴로 보이고 지금 트윈에 테두리를 붙인다. */
export function TwinSwitchSheet({ visible, current, onPick, onClose }: TwinSwitchSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} aria-label="시트 닫기" />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text role="heading" aria-level={3} style={styles.title}>
            트윈 바꾸기
          </Text>
          <Pressable role="button" aria-label="닫기" hitSlop={12} onPress={onClose}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <View role="radiogroup" aria-label="트윈" style={styles.grid}>
          {PRESET_TWINS.map((twin) => {
            const on = twin.key === current;
            return (
              <Pressable
                key={twin.key}
                role="radio"
                aria-checked={on}
                aria-label={twin.name}
                onPress={() => onPick(twin.key)}
                style={styles.item}
              >
                <View style={[styles.face, on && styles.faceOn]}>
                  <Image source={TWIN_ASSETS[twin.key].base} style={styles.faceImage} />
                </View>
                <Text style={styles.name}>{twin.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const FACE = 64;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    padding: 24,
    gap: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "600" },
  close: { fontSize: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16 },
  item: { width: "33.33%", alignItems: "center", gap: 6 },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#f2f2f2",
  },
  faceOn: { borderColor: "#111" },
  // 기본 사진의 얼굴이 원 가운데 오도록 크게 키워 위쪽을 보인다.
  faceImage: {
    width: FACE * 3.2,
    height: FACE * 4.3,
    marginLeft: -FACE * 1.1,
    marginTop: -FACE * 0.25,
  },
  name: { fontSize: 13 },
});

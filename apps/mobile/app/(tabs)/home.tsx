import { DEFAULT_PRESET_TWIN, presetTwin, type PresetTwinKey } from "@nuno/twin";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { completeTour } from "../../src/composition/profile";
import { loadCurrentTwin, switchTwin } from "../../src/composition/twin";
import { FirstTour } from "../../src/ui/first-tour";
import { useProfile } from "../../src/ui/profile-gate";
import { Toast, useToast } from "../../src/ui/toast";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";
import { TwinSwitchSheet } from "../../src/ui/twin-switch-sheet";

// 홈 시트 두 칸. 옷과 룩은 T3, T5 에서 생기고, 지금은 틀과 빈 상태만 있다.
// 칸은 role tab 이 아니라 단추다. 하단 탭 셋만 tab 으로 센다.
const CELLS = [
  {
    key: "looks",
    label: "최근 저장한 룩",
    empty: "피팅룸에서 코디를 입혀 보고 룩북에 저장하면 여기에 보여요.",
  },
  { key: "clothes", label: "최근 넣은 옷", empty: "옷장에 옷을 넣으면 여기에 먼저 보여요." },
] as const;

type CellKey = (typeof CELLS)[number]["key"];

// 홈 무대: 고른 트윈의 기본 코디 완성 사진이 흰 바탕 위에 선다. 꾸민 얼굴과 입힌 옷은 반영하지 않는다.
export default function HomeScreen() {
  const { profile, refresh } = useProfile();
  const toast = useToast();
  const { show } = toast;
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [switching, setSwitching] = useState(false);
  const [cell, setCell] = useState<CellKey>("looks");

  useEffect(() => {
    loadCurrentTwin().then(setTwin, (caught: unknown) => show(String(caught)));
  }, [show]);

  const pick = async (key: PresetTwinKey) => {
    await switchTwin(key);
    setTwin(key);
    setSwitching(false);
    show(`${presetTwin(key).name} 트윈으로 바꿨어요`);
  };

  const finishTour = async () => {
    await completeTour();
    await refresh();
  };

  const current = CELLS.find((item) => item.key === cell) ?? CELLS[0];

  return (
    <View style={styles.screen}>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <Pressable
              role="button"
              aria-label="알림"
              hitSlop={12}
              onPress={() => show("새 알림이 없어요")}
              style={styles.bell}
            >
              <Text style={styles.bellIcon}>🔔</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.stage}>
          {twin ? (
            <Image
              role="img"
              aria-label={`${presetTwin(twin).name} 기본 코디`}
              source={TWIN_ASSETS[twin].outfit}
              resizeMode="contain"
              style={styles.stageImage}
            />
          ) : null}
          <Pressable role="button" onPress={() => setSwitching(true)} style={styles.switchButton}>
            <Text style={styles.switchLabel}>트윈 바꾸기</Text>
          </Pressable>
        </View>

        <View style={styles.sheet}>
          <View style={styles.cells}>
            {CELLS.map((item) => (
              <Pressable
                key={item.key}
                role="button"
                aria-pressed={cell === item.key}
                onPress={() => setCell(item.key)}
                style={StyleSheet.flatten([styles.cell, cell === item.key && styles.cellOn])}
              >
                <Text style={[styles.cellLabel, cell === item.key && styles.cellLabelOn]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.empty}>{current.empty}</Text>
        </View>
      </ScrollView>

      <TwinSwitchSheet
        visible={switching}
        current={twin ?? DEFAULT_PRESET_TWIN}
        onPick={(key) => void pick(key)}
        onClose={() => setSwitching(false)}
      />
      <FirstTour visible={!profile.tourSeen} onDone={() => void finishTour()} />
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  body: { paddingBottom: 32 },
  bell: { marginRight: 16 },
  bellIcon: { fontSize: 20 },
  stage: { width: "100%", aspectRatio: 3 / 4, backgroundColor: "#fff" },
  stageImage: { width: "100%", height: "100%" },
  switchButton: {
    position: "absolute",
    left: 16,
    top: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,17,17,0.85)",
  },
  switchLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },
  sheet: {
    marginTop: -16,
    padding: 20,
    gap: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fafafa",
  },
  cells: { flexDirection: "row", gap: 16 },
  cell: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
  cellOn: { borderBottomColor: "#111" },
  cellLabel: { fontSize: 15, color: "#888" },
  cellLabelOn: { color: "#111", fontWeight: "600" },
  empty: { fontSize: 14, color: "#777", lineHeight: 20 },
});

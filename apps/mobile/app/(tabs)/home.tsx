import { DEFAULT_PRESET_TWIN, presetTwin, type PresetTwinKey } from "@nuno/twin";
import { categoryLabel } from "@nuno/wardrobe";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { wearTodayLook } from "../../src/composition/outfit";
import { completeTour } from "../../src/composition/profile";
import { loadCurrentTwin, switchTwin } from "../../src/composition/twin";
import {
  loadRecentGarments,
  onClosetChange,
  type ClosetView,
} from "../../src/composition/wardrobe";
import { FirstTour } from "../../src/ui/first-tour";
import { GarmentCard } from "../../src/ui/garment-card";
import { useProfile } from "../../src/ui/profile-gate";
import { useAppToast } from "../../src/ui/app-toast";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";
import { TwinSwitchSheet } from "../../src/ui/twin-switch-sheet";

// 홈 시트 두 칸. 「최근 넣은 옷」 은 옷장 두 칸을 합쳐 마지막에 넣은 옷부터 12벌을 3열로 보인다. 룩은 T5 에서 생긴다.
// 칸은 role tab 이 아니라 단추다. 하단 탭 셋만 tab 으로 센다.
const CELLS = [
  {
    key: "recentLooks",
    label: "최근 저장한 룩",
    empty: "피팅룸에서 코디를 입혀 보고 룩북에 저장하면 여기에 보여요.",
  },
  { key: "recentGarments", label: "최근 넣은 옷", empty: "옷장에 옷을 넣으면 여기에 먼저 보여요." },
] as const;

type CellKey = (typeof CELLS)[number]["key"];

// 홈 무대: 고른 트윈의 기본 코디 완성 사진이 흰 바탕 위에 선다. 꾸민 얼굴과 입힌 옷은 반영하지 않는다.
export default function HomeScreen() {
  const { profile, refresh } = useProfile();
  const toast = useAppToast();
  const { show } = toast;
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [switching, setSwitching] = useState(false);
  const [cell, setCell] = useState<CellKey>("recentLooks");
  const [recent, setRecent] = useState<ClosetView | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const load = () => void loadRecentGarments().then(setRecent);
      load();
      return onClosetChange(load);
    }, []),
  );

  useEffect(() => {
    loadCurrentTwin().then(setTwin, (caught: unknown) => show(String(caught)));
  }, [show]);

  const pick = async (key: PresetTwinKey) => {
    if (key === twin) {
      setSwitching(false);
      return;
    }
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
          <View style={styles.stageLeft}>
            <Pressable role="button" onPress={() => setSwitching(true)} style={styles.stageButton}>
              <Text style={styles.switchLabel}>트윈 바꾸기</Text>
            </Pressable>
            <Pressable
              role="button"
              onPress={() => void wearTodayLook().then(() => router.navigate("/fitting/coordi"))}
              style={styles.stageButton}
            >
              <Text style={styles.switchLabel}>오늘 코디</Text>
            </Pressable>
          </View>
          <Pressable
            role="button"
            onPress={() => router.navigate("/fitting/coordi")}
            style={[styles.stageButton, styles.stageRight]}
          >
            <Text style={styles.switchLabel}>코디</Text>
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
          {current.key === "recentGarments" && recent && recent.garments.length > 0 ? (
            <View style={styles.recent}>
              <View style={styles.recentHead}>
                <Text style={styles.recentCount}>
                  내 옷 {recent.counts.mine}벌, 담은 옷 {recent.counts.wanted}벌
                </Text>
                <Pressable role="button" onPress={() => router.navigate("/fitting/closet")}>
                  <Text style={styles.recentLink}>옷장 보기 ›</Text>
                </Pressable>
              </View>
              <View style={styles.recentGrid}>
                {recent.garments.map((garment) => (
                  <View key={garment.id} style={styles.recentCell}>
                    <GarmentCard
                      name={garment.name}
                      thumbUri={garment.thumbUri}
                      subline={categoryLabel(garment.category)}
                      wanted={garment.closet === "wanted"}
                      onPress={() => router.push(`/garment/${garment.id}`)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.empty}>{current.empty}</Text>
          )}
        </View>
      </ScrollView>

      <TwinSwitchSheet
        visible={switching}
        current={twin ?? DEFAULT_PRESET_TWIN}
        onPick={(key) => void pick(key)}
        onClose={() => setSwitching(false)}
      />
      <FirstTour visible={!profile.tourSeen} onDone={() => void finishTour()} />
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
  stageLeft: { position: "absolute", left: 16, top: 16, gap: 8, alignItems: "flex-start" },
  stageRight: { position: "absolute", right: 16, top: 16 },
  stageButton: {
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
  recent: { gap: 12 },
  recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recentCount: { fontSize: 14, color: "#76736C" },
  recentLink: { fontSize: 14, fontWeight: "700", color: "#151314" },
  recentGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, rowGap: 16 },
  recentCell: { width: "33.333%", paddingHorizontal: 5 },
});

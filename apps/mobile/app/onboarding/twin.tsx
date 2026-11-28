import { PRESET_TWINS, presetTwin, type PresetKind, type PresetTwinKey } from "@nuno/twin";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickTwin, skipTwinPick } from "../../src/composition/twin";
import { withRo } from "../../src/ui/korean-particle";
import { useProfile } from "../../src/ui/profile-gate";
import { StepDots } from "../../src/ui/step-dots";
import { useAppToast } from "../../src/ui/app-toast";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";
import { TwinCard } from "../../src/ui/twin-card";

const INK = "#151314";
const SUB = "#5F5C56";
const PAPER = "#FCFBFA";

/** 아래 고정 영역(안내 두 줄과 52 단추) 높이. 카드 목록 끝에 이만큼 비워 둔다 */
const FOOTER_HEIGHT = 120;

const KINDS: { kind: PresetKind; label: string }[] = [
  { kind: "realistic", label: "실사" },
  { kind: "doll", label: "인형" },
];

// 온보딩 1단계. 「<이름>으로 시작」 은 트윈을 저장하고 스타일 단계로 간다.
// 오른쪽 위 「건너뛰기」 는 기본 트윈으로 온보딩을 끝낸다. 프로필을 다시 읽으면 루트의 Stack.Protected 가 홈으로 보낸다.
// 「실사」, 「인형」 을 바꿔도 고른 트윈은 그대로 둔다. 단추는 다른 종류 탭에서도 고른 트윈 이름을 보인다.
export default function TwinPickScreen() {
  const { refresh } = useProfile();
  const router = useRouter();
  const toast = useAppToast();
  const [kind, setKind] = useState<PresetKind>("realistic");
  const [picked, setPicked] = useState<PresetTwinKey | null>(null);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  const save = async (task: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    try {
      await task();
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const start = () => {
    if (picked === null) {
      toast.show("트윈을 하나 골라 주세요");
      return;
    }
    void save(async () => {
      await pickTwin(picked);
      router.push("/onboarding/style");
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top, paddingBottom: FOOTER_HEIGHT + insets.bottom + 16 },
        ]}
      >
        <View style={styles.topRow}>
          <StepDots current={1} />
          <Pressable
            role="button"
            onPress={() =>
              void save(async () => {
                await skipTwinPick();
                await refresh();
              })
            }
            style={styles.skip}
          >
            <Text style={styles.skipLabel}>건너뛰기</Text>
          </Pressable>
        </View>
        <Text role="heading" aria-level={1} style={styles.title}>
          옷을 입어 볼 트윈을 골라 주세요
        </Text>
        <View style={styles.lead}>
          <Text style={styles.leadText}>트윈은 나 대신 옷을 입어 볼 가상 모델이에요</Text>
          <Text style={styles.leadSub}>나중에 피팅룸 트윈 탭에서 바꿀 수 있어요</Text>
        </View>

        <View style={styles.kindRow}>
          <Text style={styles.group}>기본 트윈</Text>
          <View style={styles.toggle}>
            {KINDS.map((item) => (
              <Pressable
                key={item.kind}
                role="button"
                aria-pressed={kind === item.kind}
                onPress={() => setKind(item.kind)}
                style={StyleSheet.flatten([
                  styles.toggleItem,
                  kind === item.kind && styles.toggleOn,
                ])}
              >
                <Text style={[styles.toggleLabel, kind === item.kind && styles.toggleLabelOn]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View role="radiogroup" aria-label="트윈" style={styles.grid}>
          {PRESET_TWINS.filter((twin) => twin.kind === kind).map((twin) => (
            <TwinCard
              key={twin.key}
              name={twin.name}
              source={TWIN_ASSETS[twin.key].base}
              selected={picked === twin.key}
              onPress={() => setPicked(twin.key)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <Text style={styles.hint}>
          키와 체형도 트윈 탭에서 바꿀 수 있어요{"\n"}몸 치수는 넣지 않아도 돼요
        </Text>
        <Pressable
          role="button"
          onPress={start}
          style={StyleSheet.flatten([styles.button, picked === null && styles.buttonIdle])}
        >
          <Text style={[styles.buttonLabel, picked === null && styles.buttonLabelIdle]}>
            {picked === null ? "트윈을 골라 주세요" : `${withRo(presetTwin(picked).name)} 시작`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  body: { paddingHorizontal: 20 },
  // 머리 줄 높이 44. 왼쪽 점 넷과 「1 / 4」, 오른쪽 「건너뛰기」(2~4단계 머리 줄과 같은 글자).
  topRow: { height: 44, flexDirection: "row", alignItems: "center" },
  skip: { height: 44, marginLeft: "auto", justifyContent: "center" },
  skipLabel: { fontSize: 15, fontWeight: "500", color: SUB },
  title: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: "700", color: INK },
  lead: { marginTop: 8, gap: 2 },
  leadText: { fontSize: 15, lineHeight: 22, color: INK },
  leadSub: { fontSize: 15, lineHeight: 22, color: SUB },
  kindRow: {
    marginTop: 20,
    height: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  group: { fontSize: 17, fontWeight: "700", color: INK },
  toggle: {
    width: 120,
    height: 36,
    flexDirection: "row",
    padding: 3,
    borderRadius: 18,
    backgroundColor: "#F6F5F3",
  },
  toggleItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  toggleOn: { backgroundColor: INK },
  toggleLabel: { fontSize: 14, fontWeight: "500", color: SUB },
  toggleLabelOn: { fontWeight: "600", color: "#fff" },
  grid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 10,
    backgroundColor: PAPER,
  },
  hint: { fontSize: 13, lineHeight: 18, color: SUB, textAlign: "center" },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
  },
  buttonIdle: { backgroundColor: "#E7E6E3" },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonLabelIdle: { color: SUB },
});

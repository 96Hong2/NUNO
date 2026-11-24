import { PRESET_TWINS, presetTwin, type PresetKind, type PresetTwinKey } from "@nuno/twin";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { skipTwinPick, startWithTwin } from "../../src/composition/twin";
import { withRo } from "../../src/ui/korean-particle";
import { useProfile } from "../../src/ui/profile-gate";
import { StepDots } from "../../src/ui/step-dots";
import { Toast, useToast } from "../../src/ui/toast";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";
import { TwinCard } from "../../src/ui/twin-card";

const KINDS: { kind: PresetKind; label: string }[] = [
  { kind: "realistic", label: "실사" },
  { kind: "doll", label: "인형" },
];

// 온보딩 1단계. 왼쪽 위 X 는 기본 트윈으로 건너뛴다.
// 저장하면 프로필을 다시 읽고, 루트의 Stack.Protected 가 다음 화면으로 보낸다.
export default function TwinPickScreen() {
  const { refresh } = useProfile();
  const toast = useToast();
  const [kind, setKind] = useState<PresetKind>("realistic");
  const [picked, setPicked] = useState<PresetTwinKey | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (task: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    try {
      await task();
      await refresh();
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  const start = () => {
    if (picked === null) {
      toast.show("트윈을 하나 골라 주세요");
      return;
    }
    void save(() => startWithTwin(picked));
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.topRow}>
          <Pressable
            role="button"
            aria-label="닫기"
            hitSlop={12}
            onPress={() => void save(skipTwinPick)}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <StepDots current={1} />
        </View>
        <Text role="heading" aria-level={1} style={styles.title}>
          옷을 입어 볼 트윈을 골라 주세요
        </Text>
        <Text style={styles.subtitle}>나중에 홈의 「트윈 바꾸기」 에서 바꿀 수 있어요</Text>

        <View style={styles.kindRow}>
          <Text style={styles.group}>기본 트윈</Text>
          <View style={styles.toggle}>
            {KINDS.map((item) => (
              <Pressable
                key={item.kind}
                role="button"
                aria-pressed={kind === item.kind}
                onPress={() => {
                  setKind(item.kind);
                  setPicked(null);
                }}
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
        <Text style={styles.hint}>키와 체형은 나중에 맞춰요. 실제 사이즈는 재지 않아요</Text>
      </ScrollView>

      <Pressable
        role="button"
        onPress={start}
        style={StyleSheet.flatten([styles.button, picked === null && styles.buttonIdle])}
      >
        <Text style={styles.buttonLabel}>
          {picked === null ? "트윈을 골라 주세요" : `${withRo(presetTwin(picked).name)} 시작`}
        </Text>
      </Pressable>
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  body: { padding: 24, gap: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  close: { fontSize: 22 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#777" },
  kindRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  group: { fontSize: 15, fontWeight: "600" },
  toggle: { flexDirection: "row", borderRadius: 18, backgroundColor: "#f2f2f2", padding: 3 },
  toggleItem: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 15 },
  toggleOn: { backgroundColor: "#111" },
  toggleLabel: { fontSize: 14, color: "#555" },
  toggleLabelOn: { color: "#fff" },
  grid: { flexDirection: "row", gap: 10 },
  hint: { fontSize: 13, color: "#777" },
  button: {
    margin: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111",
  },
  buttonIdle: { backgroundColor: "#c8c8c8" },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "600" },
});

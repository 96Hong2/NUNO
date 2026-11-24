import { STYLE_TAGS, STYLE_TAGS_MAX, toggleStyleTag } from "@nuno/profile";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { finishStyleStep } from "../../src/composition/profile";
import { useProfile } from "../../src/ui/profile-gate";
import { StepDots } from "../../src/ui/step-dots";
import { useAppToast } from "../../src/ui/app-toast";

// 온보딩 2단계. 「다음」 은 고른 태그를 저장하고, 「나중에 고를게요」 와 「건너뛰기」 는 그냥 끝낸다.
// 셋 다 온보딩을 끝내며, 프로필을 다시 읽으면 루트의 Stack.Protected 가 홈으로 보낸다.
export default function StyleScreen() {
  const { refresh } = useProfile();
  const toast = useAppToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const finish = async (tags: string[] | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await finishStyleStep(tags);
      await refresh();
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  const toggle = (tag: string) => {
    const result = toggleStyleTag(selected, tag);
    if (result.ok) setSelected(result.selected);
    else if (result.reason === "max") toast.show(`${STYLE_TAGS_MAX}개까지 고를 수 있어요`);
  };

  const next = () => {
    if (selected.length === 0) {
      toast.show("스타일을 하나 이상 골라 주세요");
      return;
    }
    void finish(selected);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.topRow}>
          <StepDots current={2} />
          <Pressable role="button" hitSlop={12} onPress={() => void finish(null)}>
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        </View>
        <Text role="heading" aria-level={1} style={styles.title}>
          좋아하는 스타일을 골라 주세요
        </Text>
        <Text style={styles.subtitle}>고른 해시태그는 마이 프로필에 보여요</Text>
        <Text style={styles.count}>
          {selected.length} / {STYLE_TAGS_MAX}
        </Text>
        <View role="group" aria-label="스타일 해시태그" style={styles.chips}>
          {STYLE_TAGS.map((tag) => {
            const on = selected.includes(tag);
            return (
              <Pressable
                key={tag}
                role="checkbox"
                aria-checked={on}
                aria-label={`#${tag}`}
                onPress={() => toggle(tag)}
                style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>#{tag}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable role="button" onPress={() => void finish(null)} style={styles.later}>
          <Text style={styles.laterLabel}>나중에 고를게요</Text>
        </Pressable>
      </ScrollView>

      <Pressable
        role="button"
        onPress={next}
        style={StyleSheet.flatten([styles.button, selected.length === 0 && styles.buttonIdle])}
      >
        <Text style={styles.buttonLabel}>다음</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  body: { padding: 24, gap: 14 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skip: { fontSize: 15, color: "#555" },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#777" },
  count: { fontSize: 14, color: "#555" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d0d0d0",
  },
  chipOn: { backgroundColor: "#111", borderColor: "#111" },
  chipLabel: { fontSize: 14, color: "#333" },
  chipLabelOn: { color: "#fff" },
  later: { alignSelf: "center", paddingVertical: 8 },
  laterLabel: { fontSize: 14, color: "#777", textDecorationLine: "underline" },
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

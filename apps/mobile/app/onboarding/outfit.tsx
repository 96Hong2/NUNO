import { ONBOARDING_SAMPLES, refKey, samplePiece, type SampleGarmentKey } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { categoryLabel } from "@nuno/wardrobe";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { finishOnboardingOutfit } from "../../src/composition/outfit";
import { loadCurrentTwin } from "../../src/composition/twin";
import { useAppToast } from "../../src/ui/app-toast";
import { buildCatalog } from "../../src/ui/coordi-catalog";
import { CoordiStage } from "../../src/ui/coordi-stage";
import { CHERRY } from "../../src/ui/garment-card";
import { useProfile } from "../../src/ui/profile-gate";
import { SAMPLE_GARMENT_IMAGES } from "../../src/ui/sample-assets";
import { OnboardingHead } from "../../src/ui/onboarding-head";

const ROWS = [
  { key: "outer", label: categoryLabel("outer"), items: ONBOARDING_SAMPLES.outer },
  { key: "bottom", label: categoryLabel("bottom"), items: ONBOARDING_SAMPLES.bottom },
] as const;

// 온보딩 3단계 「입고 싶은 옷을 골라 보세요」. 줄마다 하나씩 고르면 트윈 위에 바로 겹친다.
// 「이대로 입히기」 는 4/4 「완성 룩이에요」 로 간다. 저장은 그 화면의 룩북 저장 시트에서 한다.
export default function OnboardingOutfitScreen() {
  const { refresh } = useProfile();
  const toast = useAppToast();
  const router = useRouter();
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [picked, setPicked] = useState<{ outer?: SampleGarmentKey; bottom?: SampleGarmentKey }>({});
  const [saving, setSaving] = useState(false);
  const catalog = useMemo(() => new Map(buildCatalog([]).map((item) => [item.key, item])), []);

  useEffect(() => {
    void loadCurrentTwin().then(setTwin);
  }, []);

  const outfit = [picked.outer, picked.bottom]
    .filter((key): key is SampleGarmentKey => Boolean(key))
    .map(samplePiece);
  const ready = Boolean(picked.outer && picked.bottom);

  /** 「건너뛰기」: 옷을 입히지 않고 온보딩을 끝낸다 */
  const skip = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await finishOnboardingOutfit(null);
      await refresh();
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  /** 「이대로 입히기」: 저장하지 않고 4/4 「완성 룩이에요」 로 간다. 저장은 4/4 의 룩북 저장 시트에서 한다 */
  const submit = () => {
    if (!ready || !picked.outer || !picked.bottom) {
      toast.show("아우터와 하의를 하나씩 골라 주세요");
      return;
    }
    router.navigate({
      pathname: "/onboarding/look",
      params: { outer: picked.outer, bottom: picked.bottom },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <OnboardingHead step={3} previous="/onboarding/style" onSkip={() => void skip()} />
        <Text role="heading" aria-level={1} style={styles.title}>
          입고 싶은 옷을 골라 보세요
        </Text>
        <Text style={styles.subtitle}>신발과 가방은 고른 옷에 맞춰 채워 드려요</Text>
        <View style={styles.stage}>
          {twin ? <CoordiStage twinKey={twin} outfit={outfit} catalog={catalog} /> : null}
        </View>
        {ROWS.map((row) => (
          <View key={row.key} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <View role="radiogroup" aria-label={row.label} style={styles.cards}>
              {row.items.map((item) => {
                const on = picked[row.key] === item.key;
                return (
                  <Pressable
                    key={item.key}
                    role="radio"
                    aria-checked={on}
                    aria-label={item.label}
                    testID={refKey(samplePiece(item.key).ref)}
                    onPress={() => setPicked({ ...picked, [row.key]: on ? undefined : item.key })}
                    style={styles.card}
                  >
                    <View style={[styles.photo, on && styles.photoOn]}>
                      <Image
                        source={SAMPLE_GARMENT_IMAGES[item.key]}
                        resizeMode="contain"
                        style={styles.fill}
                      />
                    </View>
                    <Text style={[styles.cardLabel, on && styles.cardLabelOn]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <Pressable
        role="button"
        onPress={submit}
        style={[styles.button, !ready && styles.buttonIdle]}
      >
        <Text style={[styles.buttonLabel, !ready && styles.buttonLabelIdle]}>이대로 입히기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFBFA" },
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#777" },
  stage: { height: 300, overflow: "hidden", borderRadius: 16 },
  fill: { width: "100%", height: "100%" },
  row: { gap: 8 },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#151314" },
  cards: { flexDirection: "row", gap: 10 },
  card: { flex: 1, gap: 6, alignItems: "center" },
  photo: {
    width: "100%",
    aspectRatio: 1,
    padding: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#F4F3F1",
  },
  photoOn: { borderColor: CHERRY },
  cardLabel: { fontSize: 13, color: "#151314" },
  cardLabelOn: { fontWeight: "700" },
  button: {
    margin: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#151314",
  },
  buttonIdle: { backgroundColor: "#E7E6E3" },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "600" },
  buttonLabelIdle: { color: "#5F5C56" },
});

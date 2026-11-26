import { SAMPLE_GARMENTS, samplePiece, type SampleGarmentKey } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { newLookId, nowIso, todayLabels } from "../../src/composition/lookbook";
import { finishOnboardingOutfit } from "../../src/composition/outfit";
import { loadCurrentTwin } from "../../src/composition/twin";
import { useAppToast } from "../../src/ui/app-toast";
import { LookImage, lookCaption } from "../../src/ui/look-image";
import { LookSaveSheet } from "../../src/ui/look-save-sheet";
import { useProfile } from "../../src/ui/profile-gate";
import { ONBOARDING_LOOK_PHOTOS } from "../../src/ui/sample-assets";
import { OnboardingHead } from "../../src/ui/onboarding-head";

/** 「트윈에 입히고 있어요」 를 보이는 시간(와이어프레임 0.9초) */
const MAKING_MS = 900;

// 온보딩 4/4 「완성 룩이에요」. 3단계에서 고른 아우터와 하의를 트윈이 입은 모습을 보인다.
// 하린은 미리 만든 착장 사진, 다른 트윈은 옷 그림을 겹친다. 「내 룩북에 저장」 은 이 화면 위에 저장 시트를 연다.
export default function OnboardingLookScreen() {
  const { outer, bottom } = useLocalSearchParams<{ outer?: string; bottom?: string }>();
  const { profile, refresh } = useProfile();
  const toast = useAppToast();
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [making, setMaking] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  // 사진은 남은 높이에 맞춘다. 넓은 화면에서 폭으로만 정하면 문구가 화면 밖으로 밀린다.
  const [area, setArea] = useState({ width: 0, height: 0 });
  const photoWidth = Math.min(area.width * 0.78, (area.height - 40) * (900 / 1205));
  // 룩 ID 는 화면을 열 때 정한다. 저장 단추를 여러 번 눌러도 룩은 한 장이다.
  const lookId = useRef(newLookId()).current;

  useEffect(() => {
    void loadCurrentTwin().then(setTwin);
    const timer = setTimeout(() => setMaking(false), MAKING_MS);
    return () => clearTimeout(timer);
  }, []);

  const keys = [outer, bottom].filter((key): key is SampleGarmentKey =>
    Boolean(key && key in SAMPLE_GARMENTS),
  );
  const photoKey = twin ? `${twin}_${keys.join("_")}` : null;
  const look = {
    twinKey: twin ?? "harin",
    photoKey: photoKey && ONBOARDING_LOOK_PHOTOS[photoKey] ? photoKey : null,
    items: keys.map((key) => ({
      sampleKey: key,
      name: SAMPLE_GARMENTS[key].name,
      category: samplePiece(key).category,
      slot: samplePiece(key).slot,
    })),
  };

  const finish = async (title: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await finishOnboardingOutfit(
        title === null
          ? null
          : {
              id: lookId,
              title,
              twinKey: look.twinKey,
              photoKey: look.photoKey,
              createdAt: nowIso(),
              items: look.items,
            },
      );
      await refresh();
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  // 새로고침이나 깊은 링크로 옷 두 벌 없이 오면 3단계로 돌려보낸다(빈 「첫 코디」 를 만들지 않게).
  if (keys.length < 2) return <Redirect href="/onboarding/outfit" />;

  return (
    <View style={styles.screen}>
      <OnboardingHead step={4} previous="/onboarding/outfit" onSkip={() => void finish(null)} />
      <Text role="heading" aria-level={1} style={styles.title}>
        완성 룩이에요
      </Text>
      <View style={styles.body} onLayout={(event) => setArea(event.nativeEvent.layout)}>
        {making || !twin ? (
          <View style={styles.making}>
            <ActivityIndicator size="large" color="#151314" />
            <Text style={styles.makingLabel}>트윈에 입히고 있어요</Text>
          </View>
        ) : (
          <>
            <View style={[styles.photo, { width: Math.max(0, photoWidth) }]}>
              <LookImage look={look} label="트윈이 고른 옷을 입은 사진" />
            </View>
            <Text style={styles.caption}>{lookCaption(look)}</Text>
          </>
        )}
      </View>
      <Pressable
        role="button"
        aria-disabled={making}
        onPress={() => !making && setSheet(true)}
        style={[styles.button, making && styles.buttonIdle]}
      >
        <Text style={[styles.buttonLabel, making && styles.buttonLabelIdle]}>내 룩북에 저장</Text>
      </Pressable>
      <LookSaveSheet
        visible={sheet}
        look={look}
        owner={profile.displayName}
        date={todayLabels()}
        saving={saving}
        onSave={(title) => void finish(title)}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 14, backgroundColor: "#FCFBFA" },
  title: { fontSize: 24, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  making: { alignItems: "center", gap: 14 },
  makingLabel: { fontSize: 15, fontWeight: "700", color: "#151314" },
  photo: { aspectRatio: 900 / 1205, overflow: "hidden", borderRadius: 20 },
  caption: { fontSize: 12, color: "#5F5C56" },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#151314",
  },
  buttonIdle: { backgroundColor: "#E7E6E3" },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "600" },
  buttonLabelIdle: { color: "#5F5C56" },
});

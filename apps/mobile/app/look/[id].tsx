import { closetSavedMessage, wornSheetState, type Look } from "@nuno/lookbook";
import { SAMPLE_GARMENTS, type SampleGarmentKey } from "@nuno/outfit";
import { presetTwin, type PresetTwinKey } from "@nuno/twin";
import { categoryLabel, type GarmentCategory } from "@nuno/wardrobe";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { keepSamplesInCloset, loadLookbook } from "../../src/composition/lookbook";
import { wearSamples } from "../../src/composition/outfit";
import { useAppToast } from "../../src/ui/app-toast";
import { CHERRY } from "../../src/ui/garment-card";
import { LookImage } from "../../src/ui/look-image";
import { OverlaySheet } from "../../src/ui/overlay-sheet";
import { SAMPLE_GARMENT_IMAGES } from "../../src/ui/sample-assets";

/** 시트가 열려 있으면 알림을 화면 위쪽에 띄운다 */
const TOAST_OVER_SHEET = 560;

const imageOf = (key: string) => SAMPLE_GARMENT_IMAGES[key as SampleGarmentKey];

// 룩 크게 보기: 룩 그림, 제목, 입은 옷, 「트윈에 입혀 보기」. 「입은 옷」 알약이나 그림을 누르면 입은 옷 시트가 열린다.
// 옷장 판에서는 룩이 온보딩 「첫 코디」 하나뿐이라 가로로 넘기지 않는다.
export default function LookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const [looks, setLooks] = useState<Look[] | null>(null);
  const [inCloset, setInCloset] = useState<Set<string>>(new Set());
  const [twinKey, setTwinKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    () =>
      void loadLookbook().then((view) => {
        setLooks(view.looks);
        setInCloset(new Set(view.inCloset));
        setTwinKey(view.twinKey);
      }),
    [],
  );
  useFocusEffect(reload);

  if (looks === null) return <View style={styles.screen} />;
  const index = looks.findIndex((look) => look.id === id);
  const look = looks[index];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/fitting/lookbook"));
  if (!look) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>이 룩을 찾지 못했어요</Text>
        <Pressable role="button" onPress={back}>
          <Text style={styles.link}>룩북으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const notify = (message: string, actions?: { label: string; onPress: () => void }[]) =>
    toast.show(message, actions, sheet ? { bottom: TOAST_OVER_SHEET } : undefined);
  const missing = picked.filter((key) => !inCloset.has(key)).length;
  const state = wornSheetState(picked.length, missing);
  const allPicked = picked.length === look.items.length;

  const wear = (keys: readonly string[], message: string) =>
    void wearSamples(keys).then(() => {
      setSheet(false);
      setPicked([]);
      router.dismissAll();
      router.navigate("/fitting/coordi");
      toast.show(message);
    });

  const keep = async () => {
    if (picked.length === 0) {
      notify("담을 옷을 먼저 골라 주세요");
      return;
    }
    if (missing === 0) {
      notify("고른 옷은 이미 옷장에 있어요");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const result = await keepSamplesInCloset(
        look.items
          .filter((item) => picked.includes(item.sampleKey))
          .map((item) => ({
            sampleKey: item.sampleKey,
            name: item.name,
            category: item.category as GarmentCategory,
            image: imageOf(item.sampleKey),
          })),
      );
      setPicked([]);
      reload();
      notify(closetSavedMessage(result.added, result.already), [
        {
          label: "옷장에서 보기",
          onPress: () => {
            setSheet(false);
            router.dismissAll();
            router.navigate({ pathname: "/fitting/closet", params: { closet: "wanted" } });
          },
        },
      ]);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text role="heading" aria-level={1} style={styles.topTitle}>
          모든 룩
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          role="button"
          aria-label={`${look.title}, 입은 옷 ${look.items.length}벌 보기`}
          onPress={() => setSheet(true)}
          style={styles.photo}
        >
          <LookImage look={look} badge label={look.title} />
          <View style={styles.wornPill}>
            <Text style={styles.wornPillLabel}>입은 옷 {look.items.length}</Text>
          </View>
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{look.title}</Text>
          <Text style={styles.muted}>
            {index + 1} / {looks.length}
          </Text>
        </View>
        <Text style={styles.section}>입은 옷 {look.items.length}개</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.items}
        >
          {look.items.map((item) => (
            <View key={item.sampleKey} style={styles.item}>
              <View style={styles.itemPhoto}>
                <Image source={imageOf(item.sampleKey)} resizeMode="contain" style={styles.fill} />
              </View>
              <Text style={styles.muted}>{categoryLabel(item.category as GarmentCategory)}</Text>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
      <View style={styles.bar}>
        <Text style={styles.muted}>
          대표 트윈 {presetTwin((twinKey ?? look.twinKey) as PresetTwinKey).name}에게 바로 입혀요
        </Text>
        <Pressable
          role="button"
          onPress={() =>
            wear(
              look.items.map((item) => item.sampleKey),
              "트윈에 입혔어요",
            )
          }
          style={styles.primary}
        >
          <Text style={styles.primaryLabel}>트윈에 입혀 보기</Text>
        </Pressable>
      </View>

      <OverlaySheet
        visible={sheet}
        title={`입은 옷 ${look.items.length}개`}
        onClose={() => setSheet(false)}
        headerAction={
          <Pressable
            role="button"
            onPress={() => setPicked(allPicked ? [] : look.items.map((item) => item.sampleKey))}
            style={styles.pickAll}
          >
            <Text style={styles.pickAllLabel}>{allPicked ? "모두 풀기" : "모두 고르기"}</Text>
          </Pressable>
        }
      >
        {look.items.map((item) => {
          const on = picked.includes(item.sampleKey);
          const name = SAMPLE_GARMENTS[item.sampleKey as SampleGarmentKey]?.name ?? item.name;
          return (
            <View key={item.sampleKey} style={styles.row}>
              <Pressable
                role="checkbox"
                aria-checked={on}
                aria-label={`${name} 고르기`}
                onPress={() =>
                  setPicked(
                    on
                      ? picked.filter((key) => key !== item.sampleKey)
                      : [...picked, item.sampleKey],
                  )
                }
                style={[styles.box, on && styles.boxOn]}
              >
                {on ? <Text style={styles.boxMark}>✓</Text> : null}
              </Pressable>
              <View style={styles.rowPhoto}>
                <Image source={imageOf(item.sampleKey)} resizeMode="contain" style={styles.fill} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.muted}>{categoryLabel(item.category as GarmentCategory)}</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                {inCloset.has(item.sampleKey) ? (
                  <Text style={styles.inCloset}>옷장에 있음</Text>
                ) : null}
              </View>
            </View>
          );
        })}
        <Text style={styles.line}>{state.line}</Text>
        <View style={styles.sheetButtons}>
          <Pressable
            role="button"
            onPress={() => void keep()}
            style={[styles.half, state.closet.active ? styles.outline : styles.idle]}
          >
            <Text style={[styles.halfLabel, !state.closet.active && styles.idleLabel]}>
              {state.closet.label}
            </Text>
          </Pressable>
          <Pressable
            role="button"
            onPress={() =>
              picked.length === 0
                ? notify("입혀 볼 옷을 먼저 골라 주세요")
                : wear(picked, `${picked.length}벌을 트윈에 입혔어요`)
            }
            style={[styles.half, state.wear.active ? styles.cherry : styles.idle]}
          >
            <Text style={[styles.halfLabel, state.wear.active ? styles.white : styles.idleLabel]}>
              {state.wear.label}
            </Text>
          </Pressable>
        </View>
      </OverlaySheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backIcon: { fontSize: 28, color: "#151314" },
  topTitle: { fontSize: 17, fontWeight: "700", color: "#151314" },
  body: { paddingHorizontal: 16, paddingBottom: 170, gap: 12 },
  photo: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 18 },
  wornPill: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  wornPillLabel: { fontSize: 12, fontWeight: "700", color: "#151314" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#151314" },
  muted: { fontSize: 12, color: "#76736C" },
  link: { fontSize: 14, fontWeight: "700", color: "#151314" },
  section: { fontSize: 15, fontWeight: "700", color: "#151314" },
  items: { gap: 10 },
  item: { width: 96, gap: 3 },
  itemPhoto: { width: 96, height: 96, padding: 6, borderRadius: 12, backgroundColor: "#F4F3F1" },
  itemName: { fontSize: 13, fontWeight: "600", color: "#151314" },
  fill: { width: "100%", height: "100%" },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7E6E3",
    backgroundColor: "#fff",
  },
  primary: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#151314",
  },
  primaryLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  pickAll: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#F4F3F1",
  },
  pickAllLabel: { fontSize: 12, color: "#151314" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  box: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#C9C6C0",
  },
  boxOn: { borderColor: CHERRY, backgroundColor: CHERRY },
  boxMark: { color: "#fff", fontSize: 13, fontWeight: "800" },
  rowPhoto: { width: 52, height: 52, padding: 4, borderRadius: 8, backgroundColor: "#F4F3F1" },
  rowText: { flex: 1, gap: 2 },
  inCloset: { fontSize: 12, fontWeight: "700", color: CHERRY },
  line: { fontSize: 13, color: "#76736C" },
  sheetButtons: { flexDirection: "row", gap: 8 },
  half: { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12 },
  outline: { borderWidth: 1.5, borderColor: "#151314", backgroundColor: "#fff" },
  cherry: { backgroundColor: CHERRY },
  idle: { backgroundColor: "#E7E6E3" },
  halfLabel: { fontSize: 14, fontWeight: "700", color: "#151314" },
  white: { color: "#fff" },
  idleLabel: { color: "#76736C" },
});

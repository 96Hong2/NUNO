import { closetSavedMessage, type Look } from "@nuno/lookbook";
import { SAMPLE_GARMENTS, type SampleGarmentKey } from "@nuno/outfit";
import { presetTwin, type PresetTwinKey } from "@nuno/twin";
import { categoryLabel, type GarmentCategory } from "@nuno/wardrobe";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { keepSamplesInCloset, loadLookbook } from "../../src/composition/lookbook";
import { wearSamples } from "../../src/composition/outfit";
import { useAppToast } from "../../src/ui/app-toast";
import { LookImage } from "../../src/ui/look-image";
import { SAMPLE_GARMENT_IMAGES } from "../../src/ui/sample-assets";
import { WornItemsSheet } from "../../src/ui/worn-items-sheet";

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
    toast.show(message, actions);

  const wear = (keys: readonly string[], message: string) =>
    void wearSamples(keys).then(() => {
      setSheet(false);
      setPicked([]);
      if (router.canDismiss()) router.dismissAll();
      router.navigate("/fitting/coordi");
      toast.show(message);
    });

  const keep = async () => {
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
            if (router.canDismiss()) router.dismissAll();
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

      <WornItemsSheet
        visible={sheet}
        rows={look.items.map((item) => ({
          key: item.sampleKey,
          name: item.name,
          fullName: SAMPLE_GARMENTS[item.sampleKey as SampleGarmentKey]?.name,
          categoryLabel: categoryLabel(item.category as GarmentCategory),
          image: imageOf(item.sampleKey),
          inCloset: inCloset.has(item.sampleKey),
        }))}
        picked={picked}
        onPick={setPicked}
        onKeep={() => void keep()}
        onWear={() => wear(picked, `${picked.length}벌을 트윈에 입혔어요`)}
        onNotice={notify}
        onClose={() => setSheet(false)}
      />
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
});

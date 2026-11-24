import { slotOf } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import {
  cleanMeasurementText,
  DEFAULT_PLACEMENT,
  MEASUREMENT_FIELDS,
  parseMeasurements,
  nudgeScale,
  nudgeY,
  saveButtonLabel,
  scalePercent,
  SIZE_LABELS,
  type ClosetKey,
} from "@nuno/wardrobe";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { wearGarment } from "../../../src/composition/outfit";
import { loadCurrentTwin } from "../../../src/composition/twin";
import { useImageAspect } from "../../../src/ui/coordi-stage";
import { garmentFrame, type Landmarks } from "../../../src/ui/stage-layout";
import {
  clearDraft,
  currentDraft,
  loadGarment,
  saveDraft,
  saveGarmentFit,
  updateDraft,
  type DraftForm,
} from "../../../src/composition/wardrobe";
import { useAppToast } from "../../../src/ui/app-toast";
import { FlowScreen, PrimaryButton } from "../../../src/ui/flow-screen";
import { TWIN_ASSETS } from "../../../src/ui/twin-assets";
import { withObject } from "../../../src/ui/korean-particle";

// 4 / 4 「트윈에 맞춰 볼게요」: 지금 트윈 기본 사진 위에 옷을 놓고 크기와 위치를 맞춘다.
// 맞춘 값은 기준 상자 대비 비율로 저장해 코디 무대가 같은 자리에 놓는다.
// edit 에 옷 ID 를 주면 옷 상세 「고치기」 의 「치수 고치기」 다. 단계 표시 없이 「저장」 으로 끝난다.
export default function FitScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const draft = edit ? null : currentDraft();
  const [form, setForm] = useState<DraftForm | null>(draft?.form ?? null);
  const [source, setSource] = useState<{ cutoutUri: string } | null>(draft?.rendered ?? null);
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const saving = useRef(false);

  useEffect(() => {
    void loadCurrentTwin().then(setTwin);
  }, []);

  useEffect(() => {
    if (!edit) return;
    void loadGarment(edit).then((garment) => {
      if (!garment) return;
      setSource({ cutoutUri: garment.cutoutUri });
      setForm({
        category: garment.category,
        color: garment.color,
        seasons: garment.seasons,
        name: garment.name,
        nameEdited: true,
        closet: garment.closet,
        brand: garment.brand ?? "",
        price: garment.priceKrw ? String(garment.priceKrw) : "",
        link: garment.linkUrl ?? "",
        sizeLabel: garment.sizeLabel,
        measurements: Object.fromEntries(
          Object.entries(garment.measurements).map(([key, value]) => [key, String(value)]),
        ),
        placement: garment.placement ?? DEFAULT_PLACEMENT,
      });
    });
  }, [edit]);

  const garmentAspect = useImageAspect(source?.cutoutUri);

  if (edit && (!form || !source)) return <View style={styles.loading} />;
  if (!form || !source) return <Redirect href="/fitting/closet" />;
  const rendered = source;

  const change = (patch: Partial<DraftForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!edit) updateDraft({ form: next });
  };

  const saveFit = async () => {
    if (!edit || saving.current) return;
    saving.current = true;
    try {
      const measurements = parseMeasurements(form.measurements, form.category);
      await saveGarmentFit(edit, {
        sizeLabel: form.sizeLabel,
        measurements,
        placement: form.placement,
      });
      router.back();
      toast.show("치수를 고쳤어요");
    } catch (caught) {
      saving.current = false;
      toast.show(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const save = async () => {
    // 담기를 연타해도 한 번만 넣는다. 옷 ID 가 같아 기록도 한 벌만 남는다.
    if (saving.current) return;
    saving.current = true;
    try {
      const saved = await saveDraft();
      clearDraft();
      // 단계 화면을 모두 닫고, 옷이 든 칸으로 옷장을 연다.
      // 주소 값이 다르면 dismissTo 가 옛 단계 화면을 남기고 옷장을 새로 쌓는다. 그래서 모두 닫은 뒤 칸을 연다.
      if (router.canDismiss()) router.dismissAll();
      router.navigate({ pathname: "/fitting/closet", params: { closet: saved.closet } });
      const target: ClosetKey = saved.closet;
      toast.show(
        `${withObject(saved.name)} ${target === "mine" ? "내 옷" : "담은 옷"}에 넣었어요`,
        [
          {
            label: "한 벌 더 넣기",
            onPress: () =>
              router.navigate({
                pathname: "/fitting/closet",
                params: { closet: target, add: "1" },
              }),
          },
          target === "mine"
            ? {
                label: "이 옷으로 코디하기",
                onPress: () =>
                  void wearGarment(saved.id).then(() => router.navigate("/fitting/coordi")),
              }
            : {
                label: "옷장에서 보기",
                onPress: () =>
                  router.navigate({ pathname: "/fitting/closet", params: { closet: target } }),
              },
        ],
      );
    } catch (caught) {
      saving.current = false;
      toast.show(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const filled = Object.keys(parseMeasurements(form.measurements, form.category)).length;
  const landmarks = twin ? (TWIN_ASSETS[twin].landmarks as Landmarks) : null;
  const photoAspect = landmarks ? landmarks.image.width / landmarks.image.height : 3 / 4;
  const onStageLayout = (event: LayoutChangeEvent) => setStage(event.nativeEvent.layout);
  // 무대 안에 트윈 사진을 맞춘 자리와 그 위 옷 자리(무대 픽셀)
  const photoWidth = Math.min(stage.width, stage.height * photoAspect);
  const photoHeight = photoWidth / photoAspect;
  const photoLeft = (stage.width - photoWidth) / 2;
  const photoTop = (stage.height - photoHeight) / 2;
  const garmentBox = landmarks
    ? garmentFrame(
        form.category,
        slotOf(form.category),
        landmarks,
        { placement: form.placement },
        garmentAspect ?? null,
      )
    : null;

  return (
    <FlowScreen
      step={edit ? undefined : "4 / 4"}
      title={edit ? "치수 고치기" : "트윈에 맞춰 볼게요"}
      sub="치수는 넣지 않아도 돼요. 넣으면 더 정확하게 입혀요"
      onBack={() => router.back()}
      footer={
        edit ? (
          <PrimaryButton label="저장" onPress={() => void saveFit()} />
        ) : (
          <PrimaryButton label={saveButtonLabel(form.closet)} onPress={() => void save()} />
        )
      }
    >
      <View onLayout={onStageLayout} style={styles.stage}>
        {twin ? (
          <Image
            source={TWIN_ASSETS[twin].base}
            resizeMode="contain"
            style={[
              styles.abs,
              { left: photoLeft, top: photoTop, width: photoWidth, height: photoHeight },
            ]}
          />
        ) : null}
        {garmentBox ? (
          <Image
            role="img"
            aria-label="맞춰 보는 옷"
            source={{ uri: rendered.cutoutUri }}
            resizeMode="contain"
            style={[
              styles.abs,
              garmentAspect === undefined && styles.measuring,
              {
                left: photoLeft + garmentBox.x * photoWidth,
                top: photoTop + garmentBox.y * photoHeight,
                width: garmentBox.width * photoWidth,
                height: garmentBox.height * photoHeight,
              },
            ]}
          />
        ) : null}
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{filled > 0 ? "치수로 맞춤" : "사진으로 계산"}</Text>
        </View>
      </View>

      <Text style={styles.strong}>
        {filled > 0
          ? `넣은 치수 ${filled}개를 저장해 두었어요`
          : "치수가 없으면 사진을 보고 크기를 계산해요"}
      </Text>
      <View style={styles.controls}>
        <Text style={styles.controlLabel}>크기</Text>
        <Step
          label="−"
          name="작게"
          onPress={() => change({ placement: nudgeScale(form.placement, -1) })}
        />
        <Text style={styles.percent}>{scalePercent(form.placement)}%</Text>
        <Step
          label="+"
          name="크게"
          onPress={() => change({ placement: nudgeScale(form.placement, 1) })}
        />
        <Text style={[styles.controlLabel, styles.gap]}>위치</Text>
        <Step
          label="↑"
          name="위로"
          onPress={() => change({ placement: nudgeY(form.placement, -1) })}
        />
        <Step
          label="↓"
          name="아래로"
          onPress={() => change({ placement: nudgeY(form.placement, 1) })}
        />
      </View>

      <Text style={styles.label}>사이즈 표기</Text>
      <View style={styles.wrap}>
        {SIZE_LABELS.map((size) => {
          const on = form.sizeLabel === size;
          return (
            <Pressable
              key={size}
              role="button"
              aria-pressed={on}
              onPress={() => change({ sizeLabel: on ? null : size })}
              style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
            >
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{size}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>옷 치수 (선택)</Text>
      <View style={styles.fields}>
        {MEASUREMENT_FIELDS[form.category].map((field) => (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.fieldRow}>
              <TextInput
                aria-label={field.label}
                placeholder="입력"
                inputMode="decimal"
                value={form.measurements[field.key] ?? ""}
                onChangeText={(text) =>
                  change({
                    measurements: { ...form.measurements, [field.key]: cleanMeasurementText(text) },
                  })
                }
                style={styles.fieldInput}
              />
              <Text style={styles.unit}>{field.unit}</Text>
            </View>
          </View>
        ))}
      </View>
    </FlowScreen>
  );
}

function Step({ label, name, onPress }: { label: string; name: string; onPress: () => void }) {
  return (
    <Pressable role="button" aria-label={name} onPress={onPress} style={styles.step}>
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#FCFCFC" },
  stage: {
    width: "100%",
    aspectRatio: 7 / 5,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#C8B9BB",
  },
  measuring: { opacity: 0 },
  abs: { position: "absolute" },
  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(21,19,20,0.6)",
  },
  badgeLabel: { color: "#fff", fontSize: 12, fontWeight: "600" },
  strong: { fontSize: 15, fontWeight: "700", color: "#151314" },
  controls: { flexDirection: "row", alignItems: "center", gap: 10 },
  controlLabel: { fontSize: 15, color: "#151314" },
  gap: { marginLeft: 8 },
  percent: { minWidth: 56, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#151314" },
  step: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F1EF",
  },
  stepLabel: { fontSize: 18, color: "#151314" },
  label: { fontSize: 14, fontWeight: "600", color: "#76736C", marginTop: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "#F2F1EF",
  },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 14, fontWeight: "600", color: "#151314" },
  chipLabelOn: { color: "#fff" },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { width: "48%", padding: 12, borderRadius: 12, backgroundColor: "#F2F1EF", gap: 4 },
  fieldLabel: { fontSize: 13, color: "#76736C" },
  fieldRow: { flexDirection: "row", alignItems: "center" },
  // 웹 TextInput 은 기본 폭을 가진 채 줄지 않는다. 폭을 0 에서 늘려 「cm」 자리를 남긴다.
  fieldInput: { flex: 1, width: 0, minWidth: 0, fontSize: 17, fontWeight: "700", color: "#151314" },
  unit: { flexShrink: 0, marginLeft: 4, fontSize: 14, color: "#76736C" },
});

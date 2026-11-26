import { slotOf } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import {
  CLOSET_LABELS,
  cleanMeasurementText,
  DEFAULT_PLACEMENT,
  MEASUREMENT_FIELDS,
  parseMeasurements,
  nudgeScale,
  nudgeY,
  scalePercent,
  SIZE_LABELS,
  type Placement,
} from "@nuno/wardrobe";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { loadCurrentTwin } from "../../../src/composition/twin";
import { useImageAspect } from "../../../src/ui/coordi-stage";
import { garmentFrame, slotBox, type Landmarks } from "../../../src/ui/stage-layout";
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

const INK = "#151314";
const SUB = "#5F5C56";
const SURFACE = "#F6F5F3";
const LINE = "#E7E6E3";

/**
 * 끌기와 두 손가락 벌리기가 가리키는 값까지 「−」 「+」 「↑」 「↓」 와 같은 한 칸씩 옮긴다.
 * 한 칸 크기와 끝 값은 도메인 함수가 정하므로 화면은 그 함수를 되풀이해 부를 뿐이다.
 */
function stepToward(
  start: Placement,
  target: number,
  read: (placement: Placement) => number,
  nudge: (placement: Placement, direction: 1 | -1) => Placement,
): Placement {
  let current = start;
  for (let i = 0; i < 60; i += 1) {
    const moved = nudge(current, target > read(current) ? 1 : -1);
    if (Math.abs(read(moved) - target) >= Math.abs(read(current) - target)) break;
    current = moved;
  }
  return current;
}

const touchGap = (event: GestureResponderEvent): number | null => {
  const [a, b] = event.nativeEvent.touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

// 4 / 4 「트윈에 맞춰 보세요」: 지금 트윈 기본 사진 위에 옷을 놓고 크기와 위치를 맞춘다.
// 옷을 위아래로 끌어 옮기고 두 손가락으로 크기를 바꾼다. 「−」 「+」 「↑」 「↓」 는 정밀 조정용이다.
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
  const [sizesOpen, setSizesOpen] = useState(false);
  const saving = useRef(false);
  // 손짓 처리기는 한 번 만들고, 지금 값은 이 상자로 읽는다.
  const live = useRef<{
    placement: Placement;
    boxHeight: number;
    apply: (placement: Placement) => void;
  } | null>(null);
  const gesture = useRef<{ start: Placement; gap: number | null }>({
    start: DEFAULT_PLACEMENT,
    gap: null,
  });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        if (!live.current) return;
        gesture.current = { start: live.current.placement, gap: touchGap(event) };
      },
      onPanResponderMove: (event, state) => {
        const now = live.current;
        if (!now || now.boxHeight <= 0) return;
        const { start } = gesture.current;
        const gap = touchGap(event);
        if (gap !== null) {
          if (gesture.current.gap === null) gesture.current = { start: now.placement, gap };
          const from = gesture.current;
          const scale = from.start.scale * (gap / Math.max(1, from.gap ?? gap));
          now.apply(stepToward(from.start, scale, (p) => p.scale, nudgeScale));
          return;
        }
        const y = start.y + state.dy / now.boxHeight;
        now.apply(stepToward(start, y, (p) => p.y, nudgeY));
      },
    }),
  ).current;

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
    // 추가를 연타해도 한 번만 넣는다. 옷 ID 가 같아 기록도 한 벌만 남는다.
    if (saving.current) return;
    saving.current = true;
    try {
      const saved = await saveDraft();
      clearDraft();
      // 단계 화면을 모두 닫고 마친 화면을 연다.
      if (router.canDismiss()) router.dismissAll();
      router.push({ pathname: "/garment/new/done", params: { id: saved.id } });
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
  live.current = {
    placement: form.placement,
    boxHeight: landmarks
      ? slotBox(form.category, slotOf(form.category), landmarks.pose).height * photoHeight
      : 0,
    apply: (placement) => change({ placement }),
  };

  return (
    <FlowScreen
      step={edit ? undefined : "4 / 4"}
      title={edit ? "치수 고치기" : "트윈에 맞춰 보세요"}
      sub="치수는 넣지 않아도 돼요. 넣으면 더 정확하게 입혀요"
      onBack={() => router.back()}
      footer={
        edit ? (
          <PrimaryButton label="저장" onPress={() => void saveFit()} />
        ) : (
          <PrimaryButton
            label={`${CLOSET_LABELS[form.closet]}에 추가`}
            onPress={() => void save()}
          />
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
          <View
            {...responder.panHandlers}
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
          >
            <Image
              role="img"
              aria-label="맞춰 보는 옷"
              source={{ uri: rendered.cutoutUri }}
              resizeMode="contain"
              style={styles.fill}
            />
            <View pointerEvents="none" style={styles.selection} />
            {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => (
              <View key={corner} pointerEvents="none" style={[styles.handle, styles[corner]]} />
            ))}
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeLabel}>{filled > 0 ? "치수로 맞춤" : "사진으로 계산"}</Text>
        </View>
      </View>

      <Text style={styles.hint}>옷을 끌어 옮기고 두 손가락으로 크기를 바꿔요</Text>
      <View style={styles.controls}>
        <View style={styles.controlGroup}>
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
        </View>
        <View style={styles.controlGroup}>
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
      </View>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>사이즈 표기</Text>
          <Text style={styles.labelNote}>선택</Text>
        </View>
        <View style={styles.wrap}>
          {SIZE_LABELS.map((size) => {
            const on = form.sizeLabel === size;
            return (
              <Pressable
                key={size}
                role="button"
                aria-pressed={on}
                hitSlop={{ top: 4, bottom: 4 }}
                onPress={() => change({ sizeLabel: on ? null : size })}
                style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{size}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.more}>
        <Pressable
          role="button"
          aria-label="치수로 더 정확하게 맞추기"
          aria-expanded={sizesOpen || Boolean(edit)}
          onPress={() => setSizesOpen(!sizesOpen)}
          style={styles.moreRow}
        >
          <Text style={styles.moreTitle}>치수로 더 정확하게 맞추기</Text>
          <Text style={styles.moreSub}>선택</Text>
          <Chevron up={sizesOpen || Boolean(edit)} />
        </Pressable>
        {sizesOpen || edit ? (
          <View style={styles.fields}>
            {MEASUREMENT_FIELDS[form.category].map((field) => (
              <View key={field.key} style={styles.field}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <View style={styles.fieldRow}>
                  <TextInput
                    aria-label={field.label}
                    placeholder="입력"
                    placeholderTextColor="#A8A59F"
                    inputMode="decimal"
                    value={form.measurements[field.key] ?? ""}
                    onChangeText={(text) =>
                      change({
                        measurements: {
                          ...form.measurements,
                          [field.key]: cleanMeasurementText(text),
                        },
                      })
                    }
                    style={styles.fieldInput}
                  />
                  <Text style={styles.unit}>{field.unit}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
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

/** 접힌 줄 오른쪽 20 칸 화살. 접혀 있으면 아래, 펼치면 위를 본다. */
function Chevron({ up }: { up: boolean }) {
  return (
    <View aria-hidden style={styles.chevronBox}>
      <View style={[styles.chevron, up ? styles.chevronUp : styles.chevronDown]} />
    </View>
  );
}

const HANDLE = 12;

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#FCFBFA" },
  stage: {
    width: "100%",
    height: 300,
    marginTop: 2,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#C8B9BB",
  },
  measuring: { opacity: 0 },
  abs: { position: "absolute" },
  fill: { width: "100%", height: "100%" },
  // 옷 둘레 점선 선택 상자와 모서리 손잡이 넷
  selection: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#fff",
  },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    borderWidth: 1,
    borderColor: "rgba(21,19,20,0.25)",
    backgroundColor: "#fff",
  },
  topLeft: { left: -HANDLE / 2, top: -HANDLE / 2 },
  topRight: { right: -HANDLE / 2, top: -HANDLE / 2 },
  bottomLeft: { left: -HANDLE / 2, bottom: -HANDLE / 2 },
  bottomRight: { right: -HANDLE / 2, bottom: -HANDLE / 2 },
  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(21,19,20,0.8)",
  },
  badgeLabel: { color: "#fff", fontSize: 11, fontWeight: "600" },
  hint: { fontSize: 13, lineHeight: 20, fontWeight: "500", color: SUB },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlLabel: { fontSize: 14, fontWeight: "600", color: INK },
  gap: { marginRight: 10 },
  percent: { width: 56, textAlign: "center", fontSize: 15, fontWeight: "600", color: INK },
  step: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  stepLabel: { fontSize: 18, color: INK },
  section: { gap: 8, marginTop: 2 },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: INK },
  labelNote: { fontSize: 12, lineHeight: 20, color: SUB },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: SURFACE,
  },
  chipOn: { backgroundColor: INK },
  chipLabel: { fontSize: 14, fontWeight: "500", color: INK },
  chipLabelOn: { color: "#fff", fontWeight: "600" },
  more: { marginTop: 2, borderTopWidth: 1, borderTopColor: LINE },
  moreRow: { height: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  moreTitle: { fontSize: 15, fontWeight: "600", color: INK },
  moreSub: { flex: 1, fontSize: 12, color: SUB },
  chevronBox: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  chevron: {
    width: 9,
    height: 9,
    borderRightWidth: 1.75,
    borderBottomWidth: 1.75,
    borderColor: SUB,
  },
  chevronDown: { marginTop: -4, transform: [{ rotate: "45deg" }] },
  chevronUp: { marginTop: 4, transform: [{ rotate: "-135deg" }] },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 4 },
  field: {
    width: "48.8%",
    height: 64,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: SURFACE,
    gap: 2,
  },
  fieldLabel: { fontSize: 13, color: SUB },
  fieldRow: { flexDirection: "row", alignItems: "center" },
  // 웹 TextInput 은 기본 폭을 가진 채 줄지 않는다. 폭을 0 에서 늘려 「cm」 자리를 남긴다.
  fieldInput: { flex: 1, width: 0, minWidth: 0, fontSize: 17, fontWeight: "700", color: INK },
  unit: { flexShrink: 0, marginLeft: 4, fontSize: 14, color: SUB },
});

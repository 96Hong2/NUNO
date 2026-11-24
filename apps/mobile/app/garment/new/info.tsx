import {
  defaultGarmentName,
  DEFAULT_PLACEMENT,
  followGarmentName,
  normalizeLinkUrl,
  GARMENT_CATEGORIES,
  GARMENT_COLORS,
  isClosetKey,
  pickGarmentColor,
  SEASONS,
  colorLabel,
} from "@nuno/wardrobe";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { currentDraft, updateDraft, type DraftForm } from "../../../src/composition/wardrobe";
import { useAppToast } from "../../../src/ui/app-toast";
import { FlowScreen, PrimaryButton } from "../../../src/ui/flow-screen";

const OWNERSHIP = [
  { closet: "wanted", label: "사고 싶은 옷", hint: "옷장의 담은 옷에 넣어요" },
  { closet: "mine", label: "이미 가진 옷", hint: "옷장의 내 옷에 넣어요" },
] as const;

// 3 / 4 「어떤 옷인가요?」: 종류, 색(사진에서 미리 고름), 계절, 이름, 가진 옷인지, 브랜드와 가격과 링크.
export default function InfoScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const draft = currentDraft();
  const [form, setForm] = useState<DraftForm | null>(() => {
    if (!draft?.rendered) return null;
    if (draft.form) return draft.form;
    const color = pickGarmentColor(draft.rendered.pixels) ?? "black";
    const category = "top" as const;
    return {
      category,
      color,
      seasons: [],
      name: defaultGarmentName(color, category),
      nameEdited: false,
      closet: isClosetKey(from) ? from : "mine",
      brand: "",
      price: "",
      link: "",
      sizeLabel: null,
      measurements: {},
      placement: DEFAULT_PLACEMENT,
    };
  });

  if (!draft?.rendered || !form) return <Redirect href="/fitting/closet" />;

  // 3 / 4 는 자기 칸만 초안에 쓴다. 4 / 4 에서 고친 사이즈, 치수, 크기는 초안 쪽 값을 남긴다.
  const change = (patch: Partial<DraftForm>) => {
    const next = { ...form, ...patch };
    next.name = followGarmentName(next);
    setForm(next);
    const latest = currentDraft()?.form;
    updateDraft({
      form: latest
        ? {
            ...next,
            sizeLabel: latest.sizeLabel,
            measurements: latest.measurements,
            placement: latest.placement,
          }
        : next,
    });
  };
  const leaving = useRef(false);

  const toggleSeason = (key: DraftForm["seasons"][number]) =>
    change({
      seasons: form.seasons.includes(key)
        ? form.seasons.filter((s) => s !== key)
        : [...form.seasons, key],
    });

  return (
    <FlowScreen
      step="3 / 4"
      title="어떤 옷인가요?"
      onBack={() => router.back()}
      footer={
        <PrimaryButton
          label="다음"
          dimmed={form.name.trim() === ""}
          onPress={() => {
            if (form.name.trim() === "") {
              toast.show("이름을 적어 주세요");
              return;
            }
            if (form.link.trim() !== "" && normalizeLinkUrl(form.link) === null) {
              toast.show("링크를 확인해 주세요. 주소를 그대로 붙여 넣으면 돼요");
              return;
            }
            if (leaving.current) return;
            leaving.current = true;
            setTimeout(() => (leaving.current = false), 600);
            change({});
            router.push({ pathname: "/garment/new/fit", params: { from: from ?? "mine" } });
          }}
        />
      }
    >
      <View style={styles.preview}>
        <Image
          source={{ uri: draft.rendered.cutoutUri }}
          resizeMode="contain"
          style={styles.thumb}
        />
        <Text style={styles.previewText}>
          색은 사진을 보고 미리 골라 뒀어요. 틀리면 바꿔 주세요
        </Text>
      </View>

      <Text style={styles.label}>종류</Text>
      <View style={styles.wrap}>
        {GARMENT_CATEGORIES.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            on={form.category === item.key}
            onPress={() => change({ category: item.key })}
          />
        ))}
      </View>

      <Text style={styles.label}>색</Text>
      <View role="radiogroup" aria-label="색" style={styles.colors}>
        {GARMENT_COLORS.map((item) => (
          <Pressable
            key={item.key}
            role="radio"
            aria-checked={form.color === item.key}
            aria-label={item.label}
            onPress={() => change({ color: item.key })}
            style={[styles.swatchRing, form.color === item.key && styles.swatchRingOn]}
          >
            <View style={[styles.swatch, { backgroundColor: item.hex }]} />
          </Pressable>
        ))}
        <Text style={styles.colorName}>{colorLabel(form.color)}</Text>
      </View>

      <Text style={styles.label}>계절</Text>
      <View style={styles.wrap}>
        {SEASONS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            on={form.seasons.includes(item.key)}
            onPress={() => toggleSeason(item.key)}
          />
        ))}
      </View>

      <Text style={styles.label}>이름</Text>
      <TextInput
        aria-label="이름"
        value={form.name}
        maxLength={40}
        onChangeText={(name) => change({ name, nameEdited: true })}
        style={styles.input}
      />

      <Text style={styles.label}>이 옷, 가지고 있나요?</Text>
      <View role="radiogroup" aria-label="이 옷, 가지고 있나요?" style={styles.ownership}>
        {OWNERSHIP.map((item) => {
          const on = form.closet === item.closet;
          return (
            <Pressable
              key={item.closet}
              role="radio"
              aria-checked={on}
              aria-label={item.label}
              onPress={() => change({ closet: item.closet })}
              style={StyleSheet.flatten([styles.ownCard, on && styles.ownCardOn])}
            >
              <Text style={styles.ownLabel}>{item.label}</Text>
              <Text style={styles.ownHint}>{item.hint}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>브랜드, 가격, 링크(선택)</Text>
      <TextInput
        aria-label="브랜드"
        placeholder="브랜드"
        value={form.brand}
        onChangeText={(brand) => change({ brand })}
        style={styles.input}
      />
      <TextInput
        aria-label="가격"
        placeholder="가격"
        inputMode="numeric"
        value={form.price}
        onChangeText={(price) => change({ price })}
        style={styles.input}
      />
      <TextInput
        aria-label="상품 링크"
        placeholder="상품 링크"
        inputMode="url"
        autoCapitalize="none"
        value={form.link}
        onChangeText={(link) => change({ link })}
        style={styles.input}
      />
    </FlowScreen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-pressed={on}
      onPress={onPress}
      style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
    >
      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#F2F1EF" },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#76736C" },
  label: { fontSize: 14, fontWeight: "600", color: "#76736C", marginTop: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "#F2F1EF",
  },
  chipOn: { backgroundColor: "#151314" },
  chipLabel: { fontSize: 14, color: "#151314" },
  chipLabelOn: { color: "#fff", fontWeight: "700" },
  colors: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  swatchRing: { padding: 3, borderRadius: 22, borderWidth: 2, borderColor: "transparent" },
  swatchRingOn: { borderColor: "#151314" },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#E7E6E3" },
  colorName: { fontSize: 14, color: "#76736C" },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F2F1EF",
    fontSize: 16,
    color: "#151314",
  },
  ownership: { flexDirection: "row", gap: 10 },
  ownCard: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F2F1EF",
    borderWidth: 2,
    borderColor: "transparent",
  },
  ownCardOn: { backgroundColor: "#fff", borderColor: "#151314" },
  ownLabel: { fontSize: 16, fontWeight: "700", color: "#151314" },
  ownHint: { fontSize: 13, color: "#76736C" },
});

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
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { currentDraft, updateDraft, type DraftForm } from "../../../src/composition/wardrobe";
import { useAppToast } from "../../../src/ui/app-toast";
import { FlowScreen, PrimaryButton } from "../../../src/ui/flow-screen";

const OWNERSHIP = [
  { closet: "wanted", label: "사고 싶은 옷", hint: "옷장의 담은 옷에 넣어요" },
  { closet: "mine", label: "이미 가진 옷", hint: "옷장의 내 옷에 넣어요" },
] as const;

const INK = "#151314";
const SUB = "#5F5C56";
const SURFACE = "#F6F5F3";
const LINE = "#E7E6E3";
const DANGER = "#B42318";

const MORE_FIELDS = [
  { key: "brand", label: "브랜드" },
  { key: "price", label: "가격" },
  { key: "link", label: "판매처 링크" },
] as const;

// 3 / 4 「어떤 옷인가요?」: 종류, 가진 옷인지, 색(사진에서 미리 고름), 계절, 이름.
// 브랜드, 가격, 판매처 링크는 접힌 「정보 더 넣기」 안에 둔다.
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
  // 고른 종류 칩을 다시 누르면 종류가 비고, 다른 칩을 고를 때까지 「다음」 으로 넘어가지 못한다.
  const [categoryPicked, setCategoryPicked] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [triedNext, setTriedNext] = useState(false);
  const leaving = useRef(false);

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

  const pickCategory = (key: DraftForm["category"]) => {
    if (categoryPicked && form.category === key) {
      setCategoryPicked(false);
      return;
    }
    setCategoryPicked(true);
    change({ category: key });
  };

  const toggleSeason = (key: DraftForm["seasons"][number]) =>
    change({
      seasons: form.seasons.includes(key)
        ? form.seasons.filter((s) => s !== key)
        : [...form.seasons, key],
    });

  const nameEmpty = form.name.trim() === "";
  const categoryError = triedNext && !categoryPicked;
  const nameError = triedNext && nameEmpty;
  const filledMore = MORE_FIELDS.filter((field) => form[field.key].trim() !== "");
  const moreSub =
    filledMore.length > 0
      ? `${filledMore.map((field) => field.label).join(", ")} 넣음`
      : "브랜드, 가격, 판매처 링크";

  const next = () => {
    if (!categoryPicked || nameEmpty) {
      setTriedNext(true);
      return;
    }
    if (form.link.trim() !== "" && normalizeLinkUrl(form.link) === null) {
      setMoreOpen(true);
      toast.show("링크를 확인해 주세요. 주소를 그대로 붙여 넣으면 돼요");
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    setTimeout(() => (leaving.current = false), 600);
    change({});
    router.push({ pathname: "/garment/new/fit", params: { from: from ?? "mine" } });
  };

  return (
    <FlowScreen
      step="3 / 4"
      title="어떤 옷인가요?"
      onBack={() => router.back()}
      footer={<PrimaryButton label="다음" onPress={next} />}
    >
      <View style={styles.form}>
        <View style={styles.preview}>
          <Image
            source={{ uri: draft.rendered.cutoutUri }}
            resizeMode="contain"
            style={styles.thumb}
          />
          <Text style={styles.previewText}>
            종류와 색은 사진을 보고 채웠어요. 다르면 바꿔 주세요
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>종류</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {GARMENT_CATEGORIES.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                on={categoryPicked && form.category === item.key}
                onPress={() => pickCategory(item.key)}
              />
            ))}
          </ScrollView>
          {categoryError ? <Text style={styles.error}>종류를 골라 주세요</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>이 옷을 가지고 있나요?</Text>
          <View role="radiogroup" aria-label="이 옷을 가지고 있나요?" style={styles.ownership}>
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
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>색</Text>
            <Text style={styles.labelNote}>{colorLabel(form.color)}</Text>
          </View>
          <View role="radiogroup" aria-label="색" style={styles.colors}>
            {GARMENT_COLORS.map((item) => {
              const on = form.color === item.key;
              return (
                <Pressable
                  key={item.key}
                  role="radio"
                  aria-checked={on}
                  aria-label={item.label}
                  hitSlop={4}
                  onPress={() => change({ color: item.key })}
                  style={styles.swatchHit}
                >
                  {on ? <View style={styles.swatchRing} /> : null}
                  <View
                    style={[
                      styles.swatch,
                      item.key === "white" && styles.swatchWhite,
                      { backgroundColor: item.hex },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>계절</Text>
            <Text style={styles.labelNoteSmall}>여러 개를 고를 수 있어요</Text>
          </View>
          <View style={styles.chipRow}>
            {SEASONS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                on={form.seasons.includes(item.key)}
                onPress={() => toggleSeason(item.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            aria-label="이름"
            placeholder="옷 이름"
            placeholderTextColor="#A8A59F"
            value={form.name}
            maxLength={40}
            onChangeText={(name) => change({ name, nameEdited: true })}
            style={styles.input}
          />
          {nameError ? <Text style={styles.error}>이름을 적어 주세요</Text> : null}
        </View>

        <View style={styles.more}>
          <Pressable
            role="button"
            aria-label="정보 더 넣기"
            aria-expanded={moreOpen}
            onPress={() => setMoreOpen(!moreOpen)}
            style={styles.moreRow}
          >
            <Text style={styles.moreTitle}>정보 더 넣기</Text>
            <Text style={styles.moreSub} numberOfLines={1}>
              {moreSub}
            </Text>
            <Chevron up={moreOpen} />
          </Pressable>
          {moreOpen ? (
            <View style={styles.moreFields}>
              <View style={styles.section}>
                <Text style={styles.label}>브랜드</Text>
                <TextInput
                  aria-label="브랜드"
                  placeholder="예: 모노웨일"
                  placeholderTextColor="#A8A59F"
                  value={form.brand}
                  onChangeText={(brand) => change({ brand })}
                  style={styles.input}
                />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>가격</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    aria-label="가격"
                    placeholder="숫자만 넣어요"
                    placeholderTextColor="#A8A59F"
                    inputMode="numeric"
                    value={form.price}
                    onChangeText={(price) => change({ price })}
                    style={styles.innerInput}
                  />
                  <Text style={styles.unit}>원</Text>
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>판매처 링크</Text>
                <TextInput
                  aria-label="판매처 링크"
                  placeholder="상품 주소를 붙여 넣어요"
                  placeholderTextColor="#A8A59F"
                  inputMode="url"
                  autoCapitalize="none"
                  value={form.link}
                  onChangeText={(link) => change({ link })}
                  style={styles.input}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </FlowScreen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-pressed={on}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={StyleSheet.flatten([styles.chip, on && styles.chipOn])}
    >
      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
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

const styles = StyleSheet.create({
  form: { gap: 16, marginTop: 2 },
  preview: { flexDirection: "row", alignItems: "center", gap: 16 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#EFEDEA" },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20, color: SUB },
  section: { gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: INK },
  labelNote: { fontSize: 14, lineHeight: 20, color: SUB },
  labelNoteSmall: { fontSize: 12, lineHeight: 20, color: SUB },
  // 칩 줄을 화면 끝까지 넘겨 보이게 오른쪽 여백을 걷어 낸다.
  chipScroll: { marginRight: -20 },
  chipRow: { flexDirection: "row", gap: 8, paddingRight: 20 },
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
  error: { fontSize: 12, lineHeight: 16, color: DANGER },
  ownership: { flexDirection: "row", gap: 8 },
  ownCard: {
    flex: 1,
    height: 64,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderWidth: 2,
    borderColor: "transparent",
  },
  ownCardOn: { backgroundColor: "#fff", borderColor: INK },
  ownLabel: { fontSize: 15, fontWeight: "700", color: INK },
  ownHint: { fontSize: 12, color: SUB },
  colors: { flexDirection: "row", gap: 8 },
  swatchHit: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  // 고른 색은 3 띄운 바깥 2px 잉크 고리
  swatchRing: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: INK,
  },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchWhite: { borderWidth: 1, borderColor: LINE },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: SURFACE,
    fontSize: 16,
    color: INK,
  },
  inputBox: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: SURFACE,
  },
  // 웹 TextInput 은 기본 폭을 가진 채 줄지 않는다. 폭을 0 에서 늘려 「원」 자리를 남긴다.
  innerInput: { flex: 1, width: 0, minWidth: 0, height: 52, fontSize: 16, color: INK },
  unit: { flexShrink: 0, marginLeft: 8, fontSize: 14, color: SUB },
  more: { borderTopWidth: 1, borderTopColor: LINE },
  moreRow: { height: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  moreTitle: { fontSize: 15, fontWeight: "600", color: INK },
  moreSub: { flex: 1, fontSize: 12, color: SUB },
  moreFields: { gap: 16, paddingTop: 4 },
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
});

import { categoryLabel, colorLabel, linkHost, MEASUREMENT_FIELDS, SEASONS } from "@nuno/wardrobe";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  loadGarment,
  moveToCloset,
  onClosetChange,
  removeGarment,
  type GarmentDetail,
} from "../../src/composition/wardrobe";
import { wearGarment } from "../../src/composition/outfit";
import { useAppToast } from "../../src/ui/app-toast";
import { CHERRY, formatPrice } from "../../src/ui/garment-card";
import { withObject } from "../../src/ui/korean-particle";

/** 아래 단추 묶음을 재기 전에 쓰는 알림 높이. 단추 두 줄과 여백을 더한 값이다 */
const FOOTER_FALLBACK = 150;

// 옷 상세: 옷장 카드를 누르면 탭 위로 덮어 연다.
// 아래 윗줄 왼쪽 단추는 옷이 든 칸에 따라 「가진 옷으로 옮기기」(담은 옷)나 「내 옷에 있어요」(내 옷)다.
// 내 옷 칸 옷이면 그 오른쪽 「트윈에 입혀 보기」 로 지금 코디에 입히고 코디 화면을 연다. 「상품 보기」 는 아랫줄이다.
export default function GarmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const [garment, setGarment] = useState<GarmentDetail | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [footerHeight, setFooterHeight] = useState(FOOTER_FALLBACK);
  // 알림은 아래 단추 묶음 바로 위에 띄워 단추를 가리지 않는다.
  const overFooter = { bottom: footerHeight + 8 };

  const reload = useCallback(async () => {
    setGarment(await loadGarment(id));
  }, [id]);

  // 「고치기」 를 두 번 눌러 「치수 고치기」 가 두 장 쌓이지 않게, 이 화면에 돌아올 때까지 막는다.
  const opening = useRef(false);
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
      void reload();
      return onClosetChange(() => void reload());
    }, [reload]),
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace("/fitting/closet"));

  if (garment === undefined) return <View style={styles.screen} />;
  if (garment === null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>이 옷은 옷장에 없어요</Text>
        <Pressable role="button" onPress={close}>
          <Text style={styles.link}>옷장으로 가기</Text>
        </Pressable>
      </View>
    );
  }

  const moveToMine = async () => {
    await moveToCloset([garment.id], "mine");
    toast.show(
      `${withObject(garment.name)} 내 옷으로 옮겼어요`,
      [
        { label: "되돌리기", onPress: () => void moveToCloset([garment.id], "wanted") },
        {
          label: "옷장에서 보기",
          onPress: () =>
            router.navigate({ pathname: "/fitting/closet", params: { closet: "mine" } }),
        },
      ],
      overFooter,
    );
  };

  const remove = async () => {
    setConfirming(false);
    await removeGarment(garment.id);
    close();
    toast.show("옷을 지웠어요");
  };

  const measured = MEASUREMENT_FIELDS[garment.category]
    .filter((field) => garment.measurements[field.key] !== undefined)
    .map((field) => [field.label, `${garment.measurements[field.key]}${field.unit}`] as const);
  const seasons = SEASONS.filter((season) => garment.seasons.includes(season.key)).map(
    (season) => season.label,
  );
  const facts = [
    ["종류", categoryLabel(garment.category)],
    ["색", colorLabel(garment.color)],
    ["계절", seasons.length > 0 ? seasons.join(", ") : null],
  ].filter((row): row is [string, string] => row[1] !== null);

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={close}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: footerHeight + 24 }}>
        <View style={styles.photo}>
          <Image source={{ uri: garment.cutoutUri }} resizeMode="contain" style={styles.image} />
        </View>
        <View style={styles.info}>
          <Text role="heading" aria-level={1} style={styles.name}>
            {garment.name}
          </Text>
          <View style={styles.priceRow}>
            {garment.priceKrw ? (
              <Text style={styles.price}>{formatPrice(garment.priceKrw)}</Text>
            ) : (
              <View />
            )}
            <Text style={styles.closet}>{garment.closet === "mine" ? "내 옷" : "담음"}</Text>
          </View>
          {garment.brand ? <Text style={styles.brand}>{garment.brand}</Text> : null}
          <View style={styles.facts}>
            {facts.map(([label, value]) => (
              <View key={label} style={styles.fact}>
                <Text style={styles.factLabel}>{label}</Text>
                <Text style={styles.factValue}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.fit}>
            <View style={styles.fitHead}>
              <Text style={styles.fitTitle}>내가 넣은 사이즈와 치수</Text>
              <Pressable
                role="button"
                onPress={() => {
                  if (opening.current) return;
                  opening.current = true;
                  router.push({ pathname: "/garment/new/fit", params: { edit: garment.id } });
                }}
                style={styles.fitEdit}
              >
                <Text style={styles.fitEditLabel}>고치기</Text>
              </Pressable>
            </View>
            {garment.sizeLabel ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>사이즈</Text>
                <Text style={styles.factValue}>{garment.sizeLabel}</Text>
              </View>
            ) : null}
            {measured.map(([label, value]) => (
              <View key={label} style={styles.fact}>
                <Text style={styles.factLabel}>{label}</Text>
                <Text style={styles.factValue}>{value}</Text>
              </View>
            ))}
            {measured.length === 0 ? (
              <Text style={styles.fitNote}>치수가 없어 사진으로 크기를 계산해요</Text>
            ) : null}
          </View>
          <Pressable role="button" onPress={() => setConfirming(true)} style={styles.delete}>
            <Text style={styles.deleteLabel}>옷 지우기</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View
        style={styles.footer}
        onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
      >
        <View style={styles.footerRow}>
          {garment.closet === "mine" ? (
            <Pressable
              role="button"
              onPress={() => toast.show("이미 내 옷에 있어요", [], overFooter)}
              style={StyleSheet.flatten([styles.left, styles.leftDone])}
            >
              <Text style={[styles.leftLabel, styles.leftLabelDone]}>내 옷에 있어요</Text>
            </Pressable>
          ) : (
            <Pressable role="button" onPress={() => void moveToMine()} style={styles.left}>
              <Text style={styles.leftLabel}>가진 옷으로 옮기기</Text>
            </Pressable>
          )}
          {garment.closet === "mine" ? (
            <Pressable
              role="button"
              onPress={() =>
                void wearGarment(garment.id).then(() => {
                  router.dismissAll();
                  router.navigate("/fitting/coordi");
                })
              }
              style={styles.wear}
            >
              <Text style={styles.wearLabel}>트윈에 입혀 보기</Text>
            </Pressable>
          ) : null}
        </View>
        {garment.linkUrl ? (
          <Pressable
            role="button"
            onPress={() => void Linking.openURL(garment.linkUrl ?? "")}
            style={styles.shop}
          >
            <Text style={styles.shopLabel}>
              상품 보기 <Text style={styles.shopHost}>{linkHost(garment.linkUrl)}</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <Pressable
          role="button"
          style={styles.backdrop}
          onPress={() => setConfirming(false)}
          aria-label="시트 닫기"
        />
        <View role="dialog" aria-label="이 옷을 지울까요?" style={styles.sheet}>
          <Text style={styles.sheetTitle}>이 옷을 지울까요?</Text>
          <Text style={styles.sheetBody}>옷장에서 빠지고, 지운 옷은 되살릴 수 없어요.</Text>
          <Pressable role="button" onPress={() => void remove()} style={styles.sheetDanger}>
            <Text style={styles.sheetDangerLabel}>지우기</Text>
          </Pressable>
          <Pressable role="button" onPress={() => setConfirming(false)} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelLabel}>취소</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFCFC" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  missing: { fontSize: 16, color: "#76736C" },
  link: { fontSize: 15, fontWeight: "700", color: "#151314" },
  top: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  back: { fontSize: 28, lineHeight: 30, color: "#151314" },
  photo: { aspectRatio: 1, backgroundColor: "#F2F1EF", padding: 24 },
  image: { width: "100%", height: "100%" },
  info: { padding: 20, gap: 10 },
  name: { fontSize: 20, fontWeight: "700", color: "#151314" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  price: { fontSize: 22, fontWeight: "800", color: "#151314" },
  closet: { fontSize: 14, fontWeight: "600", color: CHERRY },
  brand: { fontSize: 14, color: "#76736C" },
  facts: { gap: 6, paddingTop: 6 },
  fact: { flexDirection: "row", gap: 12 },
  factLabel: { width: 52, fontSize: 14, color: "#76736C" },
  factValue: { fontSize: 14, color: "#151314" },
  fit: { gap: 6, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E7E6E3" },
  fitHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fitTitle: { fontSize: 15, fontWeight: "700", color: "#151314" },
  fitEdit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#F2F1EF",
  },
  fitEditLabel: { fontSize: 13, fontWeight: "600", color: "#151314" },
  fitNote: { fontSize: 13, color: "#76736C" },
  delete: { alignSelf: "flex-start", paddingVertical: 10 },
  deleteLabel: { fontSize: 14, color: "#76736C", textDecorationLine: "underline" },
  // 화면 바탕을 깔아 뒤의 글자가 단추 사이로 비치지 않게 한다.
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FCFCFC",
  },
  footerRow: { flexDirection: "row", gap: 8 },
  wear: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#151314",
  },
  wearLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  left: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#151314",
  },
  leftDone: { backgroundColor: "#F2F1EF" },
  leftLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },
  leftLabelDone: { color: "#151314" },
  shop: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7E6E3",
  },
  shopLabel: { fontSize: 15, fontWeight: "700", color: "#151314" },
  shopHost: { fontSize: 13, fontWeight: "400", color: "#76736C" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    padding: 24,
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
  },
  sheetTitle: { fontSize: 19, fontWeight: "700", color: "#151314" },
  sheetBody: { fontSize: 15, color: "#76736C" },
  sheetDanger: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: CHERRY,
  },
  sheetDangerLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },
  sheetCancel: { alignItems: "center", paddingVertical: 12 },
  sheetCancelLabel: { fontSize: 15, fontWeight: "600", color: "#151314" },
});

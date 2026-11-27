import { CLOSET_LABELS } from "@nuno/wardrobe";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { wearGarment } from "../../../src/composition/outfit";
import { loadGarment, type GarmentDetail } from "../../../src/composition/wardrobe";
import { CloseIcon } from "../../../src/ui/line-icon";

const INK = "#151314";
const SUB = "#5F5C56";

// 옷 넣기를 마친 화면: 「내 옷에 추가했어요」 또는 「담은 옷에 추가했어요」.
// X 는 그 옷이 든 옷장 칸으로 간다. 코디 무대는 내 옷만 입히므로 「이 옷으로 코디하기」 는 내 옷에만 둔다.
export default function GarmentDoneScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [garment, setGarment] = useState<GarmentDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setGarment(null);
      return;
    }
    let alive = true;
    void loadGarment(id).then((loaded) => {
      if (alive) setGarment(loaded);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (garment === null) return <Redirect href="/fitting/closet" />;

  const leaveTo = (params: { closet: string; add?: string } | null) => {
    if (router.canDismiss()) router.dismissAll();
    if (params) router.navigate({ pathname: "/fitting/closet", params });
    else router.navigate("/fitting/coordi");
  };

  const coordi = async () => {
    if (!garment || busy) return;
    setBusy(true);
    try {
      await wearGarment(garment.id);
      leaveTo(null);
    } finally {
      setBusy(false);
    }
  };

  const mine = garment?.closet === "mine";
  const measured = garment ? Object.keys(garment.measurements).length : 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Pressable
          role="button"
          aria-label="닫기"
          onPress={() => garment && leaveTo({ closet: garment.closet })}
          style={styles.close}
        >
          <CloseIcon color={INK} />
        </Pressable>
      </View>
      {garment ? (
        <>
          <Text role="heading" aria-level={1} style={styles.title}>
            {CLOSET_LABELS[garment.closet]}에 추가했어요
          </Text>
          <View style={styles.photo}>
            <Image
              role="img"
              aria-label={garment.name}
              source={{ uri: garment.cutoutUri }}
              resizeMode="contain"
              style={styles.image}
            />
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {garment.name}
          </Text>
          <Text style={styles.sub}>
            {measured > 0 ? `치수 ${measured}개로 맞춰 입혀요` : "사진으로 계산한 크기로 입혀요"}
          </Text>
          <View style={styles.footer}>
            {mine ? (
              <>
                <Pressable
                  role="button"
                  disabled={busy}
                  onPress={() => void coordi()}
                  style={[styles.primary, busy && styles.busy]}
                >
                  <Text style={styles.primaryLabel}>이 옷으로 코디하기</Text>
                </Pressable>
                <Pressable
                  role="button"
                  onPress={() => leaveTo({ closet: garment.closet, add: "1" })}
                  style={styles.textButton}
                >
                  <Text style={styles.textButtonLabel}>한 벌 더 넣기</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                role="button"
                onPress={() => leaveTo({ closet: garment.closet, add: "1" })}
                style={styles.primary}
              >
                <Text style={styles.primaryLabel}>한 벌 더 넣기</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFBFA" },
  top: { height: 52, justifyContent: "center", paddingHorizontal: 10 },
  // X 24 아이콘, 누르는 영역 44
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    marginTop: 8,
    paddingHorizontal: 20,
    fontSize: 26,
    fontWeight: "800",
    color: INK,
  },
  photo: {
    alignSelf: "center",
    width: 260,
    height: 260,
    marginTop: 32,
    padding: 24,
    borderRadius: 12,
    backgroundColor: "#EFEDEA",
  },
  image: { width: "100%", height: "100%" },
  name: {
    marginTop: 20,
    paddingHorizontal: 20,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: INK,
  },
  sub: { marginTop: 4, paddingHorizontal: 20, textAlign: "center", fontSize: 13, color: SUB },
  footer: { position: "absolute", left: 20, right: 20, bottom: 20, gap: 4 },
  primary: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: INK,
  },
  busy: { opacity: 0.6 },
  primaryLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  textButton: { height: 48, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { fontSize: 15, fontWeight: "600", color: SUB },
});

import { isClosetKey } from "@nuno/wardrobe";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FlowScreen } from "../../../src/ui/flow-screen";
import { useStartGarment } from "../../../src/ui/use-start-garment";

// 「사진 찍기」 1 / 4: 찍기 전 안내. 셔터를 누르면 기기 카메라가 열린다(웹은 파일 고르기 창).
// 닫기(✕)는 옷장으로 돌아가 「옷을 어떻게 넣을까요?」 시트를 다시 연다.
export default function ShootScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const from = isClosetKey(params.from) ? params.from : "mine";
  const { start, busy } = useStartGarment(from);
  const take = start;

  return (
    <FlowScreen
      dark
      step="1 / 4"
      backKind="close"
      title="옷을 펼쳐 놓고 찍어 주세요"
      sub="밝은 바닥에 펼치면 배경이 잘 지워져요"
      onBack={() => {
        if (router.canDismiss()) router.dismissAll();
        router.navigate({ pathname: "/fitting/closet", params: { closet: from, add: "1" } });
      }}
      footer={
        <View style={styles.controls}>
          <Pressable
            role="button"
            disabled={busy}
            onPress={() => void take("album")}
            style={styles.album}
          >
            <Text style={styles.albumLabel}>🖼 앨범</Text>
          </Pressable>
          <Pressable
            role="button"
            aria-label="찍기"
            disabled={busy}
            onPress={() => void take("camera")}
            style={styles.shutter}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.spacer} />
        </View>
      }
    >
      <View style={styles.viewfinder}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.busyTitle}>배경을 지우고 있어요</Text>
            <Text style={styles.frameHint}>옷만 남기고 배경을 저절로 지워요</Text>
          </View>
        ) : (
          <View style={styles.frame} />
        )}
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    marginTop: 8,
    aspectRatio: 3 / 4,
    borderRadius: 18,
    backgroundColor: "#B9AC9C",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "80%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  frameHint: { color: "#fff", fontSize: 14 },
  busy: { alignItems: "center", gap: 10 },
  busyTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  album: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2F2C2D",
  },
  albumLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  spacer: { width: 86 },
});

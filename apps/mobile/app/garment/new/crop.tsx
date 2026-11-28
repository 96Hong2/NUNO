import { faceStillVisible, type BrushStroke, type Rect } from "@nuno/wardrobe";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { currentDraft, updateDraft } from "../../../src/composition/wardrobe";
import { useAppToast } from "../../../src/ui/app-toast";
import { EditSurface } from "../../../src/ui/edit-surface";
import { FlowScreen, PrimaryButton } from "../../../src/ui/flow-screen";
import { CHERRY } from "../../../src/ui/garment-card";

const COVER_RADIUS = 0.04;

/** 처음 네모: 얼굴 아래부터 사진 끝까지. 얼굴이 없으면 전체. */
function startCrop(face: Rect | null): Rect {
  if (!face) return { x: 0, y: 0, width: 1, height: 1 };
  const top = Math.min(0.9, face.y + face.height + 0.02);
  return { x: 0.08, y: top, width: 0.84, height: Math.min(1 - top, 0.6) };
}

// 사람이 든 사진: 「옷만 보이도록 잘라 주세요」. 얼굴이 네모 안에 보이면 넘어가지 못한다.
// 「붓으로 가리기」 로 얼굴이나 이름표를 칠하면 그 자리는 옷 그림에서 지워진다.
export default function CropScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const draft = currentDraft();
  const [crop, setCrop] = useState<Rect>(() => startCrop(draft?.photo.face ?? null));
  const [covers, setCovers] = useState<BrushStroke[]>([]);
  const [covering, setCovering] = useState(false);

  const leaving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
    }, []),
  );

  if (!draft) return <Redirect href="/fitting/closet" />;
  const faceVisible = faceStillVisible(
    crop,
    draft.photo.face,
    covers,
    draft.photo.height / Math.max(1, draft.photo.width),
  );

  const proceed = () => {
    if (faceVisible) {
      toast.show("얼굴이 보이지 않게 자르기 영역을 옮기거나 붓으로 가려 주세요");
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    updateDraft({ edits: { ...draft.edits, crop, strokes: [...draft.edits.strokes, ...covers] } });
    router.push({ pathname: "/garment/new/cutout", params: { from: from ?? "mine" } });
  };

  return (
    <FlowScreen
      title="옷만 보이도록 잘라 주세요"
      sub="사진에 사람이 보여요. 얼굴과 몸은 보내기 전에 가려요. 옷만 남도록 자르기 영역을 맞춰 주세요."
      onBack={() => router.back()}
      footer={
        <>
          <PrimaryButton label="이대로 자르기" onPress={proceed} />
          <Pressable
            role="button"
            aria-pressed={covering}
            onPress={() => setCovering(!covering)}
            style={styles.cover}
          >
            <Text style={styles.coverLabel}>{covering ? "자르기 영역 맞추기" : "붓으로 가리기"}</Text>
          </Pressable>
        </>
      }
    >
      <EditSurface
        imageUri={draft.photo.originalUri}
        aspect={draft.photo.width / Math.max(1, draft.photo.height)}
        mode={covering ? "cover" : "crop"}
        brushRadius={COVER_RADIUS}
        crop={crop}
        onStroke={(stroke) => setCovers([...covers, stroke])}
        marks={covers}
        onCropChange={setCrop}
        dark
      >
        {faceVisible ? (
          <View pointerEvents="none" style={styles.badge}>
            <Text style={styles.badgeLabel}>얼굴이 보여요</Text>
          </View>
        ) : null}
      </EditSurface>
      <View style={styles.info}>
        <Text style={styles.infoText}>
          ⓘ 이름표나 주소가 보이면 붓으로 칠해 가려 주세요. 가린 부분은 서버로 보내지 않아요.
        </Text>
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#FBE3E8",
  },
  badgeLabel: { fontSize: 13, fontWeight: "700", color: CHERRY },
  info: { padding: 14, borderRadius: 14, backgroundColor: "#F2F1EF" },
  infoText: { fontSize: 13, lineHeight: 19, color: "#5F5C56" },
  cover: { alignItems: "center", paddingVertical: 10 },
  coverLabel: { fontSize: 15, fontWeight: "600", color: "#151314" },
});

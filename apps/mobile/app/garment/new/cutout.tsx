import { faceStillVisible, type BrushStroke, type GarmentEdits } from "@nuno/wardrobe";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  currentDraft,
  garmentEditable,
  renderDraft,
  releaseDraftImage,
  renderDraftPreview,
  retryDraftCutout,
  updateDraft,
} from "../../../src/composition/wardrobe";
import { useAppToast } from "../../../src/ui/app-toast";
import { EditSurface, type EditMode } from "../../../src/ui/edit-surface";
import { FlowScreen, PrimaryButton } from "../../../src/ui/flow-screen";

type Tool = "erase" | "restore" | "crop" | "rotate";

const TOOLS: { key: Tool; icon: string; label: string; hint: string }[] = [
  { key: "erase", icon: "⌫", label: "지우기", hint: "남은 배경 지우기" },
  { key: "restore", icon: "↺", label: "되살리기", hint: "지운 옷 되살리기" },
  { key: "crop", icon: "⌗", label: "자르기", hint: "모서리 끌기" },
  { key: "rotate", icon: "⟳", label: "돌리기", hint: "90도 돌리기" },
];

const BRUSHES = [
  { key: "small", label: "작게", radius: 0.015, dot: 6 },
  { key: "medium", label: "보통", radius: 0.03, dot: 9 },
  { key: "large", label: "크게", radius: 0.06, dot: 13 },
] as const;

const TOOL_HINT: Record<Exclude<Tool, "rotate">, string> = {
  erase: "손가락으로 문질러 지워요",
  restore: "지운 곳을 문질러 되살려요",
  crop: "네 모서리를 끌어 잘라요",
};

// 2 / 4 「배경을 지웠어요」: 누끼를 보고 「지우기」, 「되살리기」, 「자르기」, 「돌리기」 로 손본다.
// 붓과 자르기는 자르기 전 전체 그림 위에서 하고, 도구를 고르지 않으면 자르고 돌린 결과를 보인다.
export default function CutoutScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const draft = currentDraft();
  const [edits, setEdits] = useState<GarmentEdits | null>(draft?.edits ?? null);
  const [tool, setTool] = useState<Exclude<Tool, "rotate"> | null>(null);
  const [brush, setBrush] = useState<(typeof BRUSHES)[number]["key"]>("medium");
  const [view, setView] = useState<"original" | "cutout">("cutout");
  const [image, setImage] = useState<{ uri: string; aspect: number; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // 배경을 지우지 못한 사진(웹에서 바탕이 고르지 않은 사진 등)은 실패 화면부터 보인다.
  const [failed, setFailed] = useState(draft?.photo.cutoutSource === "none");
  const toast = useAppToast();

  // 도구를 고르면 자르기 전 전체 그림, 아니면 자르고 돌린 그림을 굽는다.
  // 자르기 도구를 쓰는 동안은 네모가 바뀌어도 다시 굽지 않는다. 그림은 자르기 전 전체라 같다.
  const bakeKey =
    tool === "crop" ? `crop|${edits?.strokes.length ?? 0}` : JSON.stringify([edits, tool]);
  // 옛 미리보기 주소는 새 그림이 화면에 오른 뒤에 놓는다. 먼저 놓으면 아직 그리는 그림이 깨진다.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!draft || !edits) return;
    let alive = true;
    const preview = tool
      ? renderDraftPreview(draft.photo, {
          ...edits,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          rotation: 0,
        })
      : renderDraftPreview(draft.photo, edits);
    preview.then(
      (rendered) => {
        if (!alive) {
          releaseDraftImage(rendered.cutoutUri);
          return;
        }
        const old = shown.current;
        shown.current = rendered.cutoutUri;
        setImage({ uri: rendered.cutoutUri, aspect: rendered.aspect, key: bakeKey });
        if (old) setTimeout(() => releaseDraftImage(old), 1000);
      },
      () => {
        if (alive) toast.show("그림을 만들지 못했어요. 도구를 다시 눌러 주세요");
      },
    );
    return () => {
      alive = false;
    };
    // bakeKey 가 edits 와 tool 을 대신한다.
  }, [bakeKey]);
  useEffect(
    () => () => {
      if (shown.current) releaseDraftImage(shown.current);
    },
    [],
  );
  const leaving = useRef(false);

  if (!draft || !edits) return <Redirect href="/fitting/closet" />;

  const change = (next: GarmentEdits) => {
    setEdits(next);
    updateDraft({ edits: next, rendered: null });
  };

  const pickTool = (key: Tool) => {
    setFailed(false);
    setView("cutout");
    if (key === "rotate") {
      setTool(null);
      change({ ...edits, rotation: ((edits.rotation + 90) % 360) as GarmentEdits["rotation"] });
      return;
    }
    // 자르기를 처음 켜면 와이어프레임처럼 가장자리에서 8% 안쪽 네모로 시작한다.
    const full = edits.crop.width === 1 && edits.crop.height === 1;
    if (key === "crop" && tool !== "crop" && full) {
      change({ ...edits, crop: { x: 0.08, y: 0.08, width: 0.84, height: 0.84 } });
    }
    setTool(tool === key ? null : key);
  };

  const retry = async () => {
    setBusy(true);
    try {
      const removed = await retryDraftCutout();
      const fresh = currentDraft();
      if (fresh) setEdits(fresh.edits);
      setFailed(!removed);
      if (!removed) toast.show("이번에도 배경을 지우지 못했어요. 직접 다듬어 주세요");
    } finally {
      setBusy(false);
    }
  };

  const trimByHand = () => {
    setFailed(false);
    setView("cutout");
    setTool("erase");
  };

  const addStroke = (stroke: BrushStroke) =>
    change({ ...edits, strokes: [...edits.strokes, stroke] });

  const next = async () => {
    if (leaving.current) return;
    // 사람이 든 사진은 여기서 자르기를 넓히거나 되살려도 얼굴이 보이면 넘어가지 못한다.
    const covers = edits.strokes.filter((stroke) => stroke.mode === "cover");
    const heightRatio = draft.photo.height / Math.max(1, draft.photo.width);
    if (faceStillVisible(edits.crop, draft.photo.face, covers, heightRatio)) {
      toast.show("얼굴이 보이지 않게 자르기 네모를 줄여 주세요");
      return;
    }
    leaving.current = true;
    setBusy(true);
    try {
      updateDraft({ edits, rendered: await renderDraft(draft.photo, edits) });
      router.push({ pathname: "/garment/new/info", params: { from: from ?? "mine" } });
    } catch {
      toast.show("그림을 만들지 못했어요. 다시 눌러 주세요");
    } finally {
      setBusy(false);
      setTimeout(() => (leaving.current = false), 600);
    }
  };

  const radius = BRUSHES.find((item) => item.key === brush)?.radius ?? 0.03;
  const showOriginal = view === "original" || failed;
  const fullAspect = draft.photo.width / Math.max(1, draft.photo.height);
  // 지금 도구와 손본 값으로 구운 그림이 오기 전에는 칠하지 못하게 한다. 옛 그림 좌표에 획이 저장되지 않게 하려고서다.
  const fresh = image?.key === bakeKey;
  const mode: EditMode = fresh ? tool : null;

  return (
    <FlowScreen
      step="2 / 4"
      title={failed ? "배경을 지우지 못했어요" : "배경을 지웠어요"}
      sub={
        failed
          ? "옷과 바닥 색이 비슷하면 잘 안 지워져요. 다시 시도하거나 직접 다듬어 주세요"
          : "잘 지워졌으면 「다음」을 눌러요. 남은 부분은 「지우기」로 다듬어요"
      }
      onBack={() => router.back()}
      footer={
        failed ? (
          <>
            <PrimaryButton label="다시 시도" disabled={busy} onPress={() => void retry()} />
            <Pressable role="button" onPress={trimByHand} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>직접 다듬기</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton label="다음" disabled={busy} onPress={() => void next()} />
        )
      }
    >
      <EditSurface
        imageUri={showOriginal ? draft.photo.originalUri : (image?.uri ?? draft.photo.cutoutUri)}
        aspect={showOriginal || tool ? fullAspect : (image?.aspect ?? fullAspect)}
        mode={showOriginal ? null : mode}
        brushRadius={radius}
        crop={edits.crop}
        onStroke={addStroke}
        onCropChange={(crop) => change({ ...edits, crop })}
        dark={showOriginal}
      >
        {tool ? (
          <View pointerEvents="none" style={styles.toolHint}>
            <Text style={styles.toolHintLabel}>{TOOL_HINT[tool]}</Text>
          </View>
        ) : null}
      </EditSurface>

      <View style={styles.viewToggle}>
        {(
          [
            ["original", "원본"],
            ["cutout", "배경 지움"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            role="button"
            aria-pressed={view === key}
            onPress={() => {
              setView(key);
              if (key === "original") setTool(null);
            }}
            style={StyleSheet.flatten([styles.viewItem, view === key && styles.viewItemOn])}
          >
            <Text style={[styles.viewLabel, view === key && styles.viewLabelOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {garmentEditable ? (
        <View style={styles.tools}>
          {TOOLS.map((item) => {
            const on = item.key === tool;
            return (
              <Pressable
                key={item.key}
                role="button"
                aria-label={item.label}
                aria-pressed={on}
                onPress={() => pickTool(item.key)}
                style={StyleSheet.flatten([styles.tool, on && styles.toolOn])}
              >
                <Text style={styles.toolIcon}>{item.icon}</Text>
                <Text style={styles.toolLabel}>{item.label}</Text>
                <Text style={styles.toolHintText}>{item.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.notice}>아이폰 손보기 도구는 곧 열려요</Text>
      )}

      {tool === "erase" || tool === "restore" ? (
        <View style={styles.brushRow}>
          <Text style={styles.brushTitle}>
            {tool === "erase" ? "지울 붓 크기" : "되살릴 붓 크기"}
          </Text>
          <View style={styles.brushChips}>
            {BRUSHES.map((item) => (
              <Pressable
                key={item.key}
                role="button"
                aria-pressed={brush === item.key}
                onPress={() => setBrush(item.key)}
                style={StyleSheet.flatten([
                  styles.brushChip,
                  brush === item.key && styles.brushChipOn,
                ])}
              >
                <View
                  style={[
                    styles.brushDot,
                    brush === item.key && styles.brushDotOn,
                    { width: item.dot, height: item.dot, borderRadius: item.dot / 2 },
                  ]}
                />
                <Text style={[styles.brushLabel, brush === item.key && styles.brushLabelOn]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  toolHint: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  toolHintLabel: { fontSize: 13, fontWeight: "600", color: "#151314" },
  viewToggle: {
    alignSelf: "center",
    flexDirection: "row",
    padding: 4,
    borderRadius: 20,
    backgroundColor: "#F2F1EF",
  },
  viewItem: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  viewItemOn: { backgroundColor: "#151314" },
  viewLabel: { fontSize: 14, color: "#76736C" },
  viewLabelOn: { color: "#fff", fontWeight: "700" },
  tools: { flexDirection: "row", gap: 8 },
  tool: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F7F7F7",
  },
  toolOn: { backgroundColor: "#E7E6E3" },
  toolIcon: { fontSize: 18 },
  toolLabel: { fontSize: 14, fontWeight: "700", color: "#151314" },
  toolHintText: { fontSize: 11, color: "#76736C" },
  notice: { fontSize: 14, color: "#76736C", textAlign: "center" },
  textButton: { alignItems: "center", paddingVertical: 10 },
  textButtonLabel: { fontSize: 15, fontWeight: "600", color: "#151314" },
  brushRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brushTitle: { fontSize: 15, fontWeight: "700", color: "#151314" },
  brushChips: { flexDirection: "row", gap: 6 },
  brushDot: { backgroundColor: "#151314" },
  brushDotOn: { backgroundColor: "#fff" },
  brushChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F2F1EF",
  },
  brushChipOn: { backgroundColor: "#151314" },
  brushLabel: { fontSize: 13, color: "#151314" },
  brushLabelOn: { color: "#fff", fontWeight: "700" },
});

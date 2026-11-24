import { layered, refKey, type Outfit, type OutfitPiece } from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { lookPhotoOf, type CatalogItem } from "./coordi-catalog";
import { drawnOnStage, onStageConfigChange, showLandmarks } from "./stage-config";
import { garmentFrame, slotBox, type Landmarks } from "./stage-layout";
import { TWIN_ASSETS } from "./twin-assets";

/** 무대 분홍 바탕. 트윈 기본 사진 가장자리 색(여섯 트윈 평균)이다. */
export const STAGE_PINK = "#CDB7B9";

interface CoordiStageProps {
  twinKey: PresetTwinKey;
  outfit: Outfit;
  catalog: ReadonlyMap<string, CatalogItem>;
  /** 무대 위 옷을 누르면 부른다(겹친 그림일 때만). 작은 카드 그림은 넘기지 않는다. */
  onTapPiece?: (piece: OutfitPiece) => void;
  /** 작은 카드 그림이면 누를 수 없고 개발용 점도 그리지 않는다. */
  thumbnail?: boolean;
}

/**
 * 트윈이 코디를 입은 무대 그림.
 * 추천 코디와 같은 조합이면 착장 사진, 아니면 기본 사진 위에 옷 그림을 아래부터 겹친다.
 */
export function CoordiStage({ twinKey, outfit, catalog, onTapPiece, thumbnail }: CoordiStageProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, setTick] = useState(0);
  useEffect(() => onStageConfigChange(() => setTick((value) => value + 1)), []);

  const assets = TWIN_ASSETS[twinKey];
  const landmarks = assets.landmarks as Landmarks;
  const aspect = landmarks.image.width / landmarks.image.height;
  const photoWidth = Math.min(size.width, size.height * aspect);
  const photoHeight = photoWidth / aspect;
  const left = (size.width - photoWidth) / 2;
  const top = (size.height - photoHeight) / 2;
  const toPx = (box: { x: number; y: number; width: number; height: number }) => ({
    left: left + box.x * photoWidth,
    top: top + box.y * photoHeight,
    width: box.width * photoWidth,
    height: box.height * photoHeight,
  });

  const lookPhoto = lookPhotoOf(twinKey, outfit);
  const pieces = lookPhoto
    ? []
    : layered(outfit).filter((piece) => catalog.has(refKey(piece.ref)) && drawnOnStage(piece));
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View onLayout={onLayout} style={styles.stage} pointerEvents={thumbnail ? "none" : "auto"}>
      {size.width > 0 ? (
        <>
          <Image
            role="img"
            aria-label={lookPhoto ? "코디를 입은 트윈 사진" : "트윈 기본 사진"}
            source={lookPhoto ?? assets.base}
            resizeMode="contain"
            style={[styles.abs, toPx({ x: 0, y: 0, width: 1, height: 1 })]}
          />
          {pieces.map((piece) => {
            const item = catalog.get(refKey(piece.ref));
            if (!item) return null;
            const frame = toPx(
              garmentFrame(piece.category, piece.slot, landmarks.pose, item.placement),
            );
            return (
              <Pressable
                key={item.key}
                testID="stage-piece"
                role={onTapPiece ? "button" : "img"}
                aria-label={`무대의 ${item.name}`}
                disabled={!onTapPiece}
                onPress={() => onTapPiece?.(piece)}
                style={[styles.abs, frame]}
              >
                <Image source={item.image} resizeMode="contain" style={styles.fill} />
              </Pressable>
            );
          })}
          {!thumbnail && showLandmarks() ? (
            <LandmarkOverlay landmarks={landmarks} outfit={outfit} toPx={toPx} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** 개발 빌드 「점 겹쳐 보기」: 어깨와 골반 점, 상의와 하의 기준 상자 */
function LandmarkOverlay({
  landmarks,
  outfit,
  toPx,
}: {
  landmarks: Landmarks;
  outfit: Outfit;
  toPx: (box: { x: number; y: number; width: number; height: number }) => object;
}) {
  const points = [11, 12, 23, 24].map((index) => ({
    index,
    x: landmarks.pose[index]?.[0] ?? 0,
    y: landmarks.pose[index]?.[1] ?? 0,
  }));
  const boxes = outfit
    .filter((piece) => piece.category === "top" || piece.category === "bottom")
    .map((piece) => ({
      key: piece.category,
      box: slotBox(piece.category, piece.slot, landmarks.pose),
    }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {boxes.map(({ key, box }) => (
        <View key={key} testID={`dev-box-${key}`} style={[styles.abs, styles.devBox, toPx(box)]} />
      ))}
      {points.map((point) => (
        <View
          key={point.index}
          testID={`dev-point-${point.index}`}
          style={[
            styles.abs,
            styles.devPoint,
            // 점은 크기 없이 자리만 잡고, 8px 동그라미를 그 자리 가운데에 둔다.
            { ...toPx({ x: point.x, y: point.y, width: 0, height: 0 }), width: 8, height: 8 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: "hidden", backgroundColor: STAGE_PINK },
  abs: { position: "absolute" },
  fill: { width: "100%", height: "100%" },
  devBox: { borderWidth: 1, borderColor: "#1E6BFF" },
  devPoint: {
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 4,
    backgroundColor: "#00C853",
  },
});

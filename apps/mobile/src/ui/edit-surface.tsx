import type { BrushStroke, Rect } from "@nuno/wardrobe";
import { useRef, useState } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent } from "react-native";

export type EditMode = "erase" | "restore" | "cover" | "crop" | null;

interface EditSurfaceProps {
  imageUri: string;
  /** 그림 가로 / 세로 */
  aspect: number;
  mode: EditMode;
  /** 사진 폭 대비 붓 반지름 */
  brushRadius: number;
  crop: Rect;
  onStroke: (stroke: BrushStroke) => void;
  onCropChange: (crop: Rect) => void;
  /** 이미 칠한 「붓으로 가리기」 자국. 회색으로 덮어 보인다. */
  marks?: readonly BrushStroke[];
  /** 바탕. 지운 곳이 보이게 격자 무늬나 어두운 색을 깐다. */
  dark?: boolean;
  children?: React.ReactNode;
}

interface Point {
  x: number;
  y: number;
}

type Corner = "tl" | "tr" | "bl" | "br";
const HANDLE = 13;
const INSET = 24;
const MIN_CROP = 0.1;
/** 모서리를 잡았다고 보는 거리(픽셀) */
const GRAB = 34;

/** 손가락이나 마우스 위치를 그림 안 비율 좌표(0~1)로 바꾼다. */
function toImagePoint(clientX: number, clientY: number, box: DOMRect, frame: Rect): Point {
  return {
    x: Math.min(1, Math.max(0, (clientX - box.left - frame.x) / frame.width)),
    y: Math.min(1, Math.max(0, (clientY - box.top - frame.y) / frame.height)),
  };
}

/**
 * 「배경을 지웠어요」 와 「옷만 보이도록 잘라 주세요」 의 그림 면. 붓 자국과 자르기 네모를 비율 좌표로 낸다.
 * 웹에서는 포인터 이벤트로 그린다. 아이폰 손보기는 Xcode 설치 뒤 붙인다(이 면은 그림만 보인다).
 */
export function EditSurface(props: EditSurfaceProps) {
  const { imageUri, aspect, mode, brushRadius, crop } = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [live, setLive] = useState<Point[]>([]);
  const dragging = useRef<{ kind: "stroke" } | { kind: "corner"; corner: Corner } | null>(null);
  const points = useRef<Point[]>([]);

  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);
  // 그림을 면 안에 비율을 지켜 맞춘 자리(면 기준 픽셀)
  // 자르기 모서리 손잡이가 면 밖으로 잘리지 않게 사방을 INSET 만큼 띄운다.
  const frame: Rect = (() => {
    if (size.width === 0 || size.height === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const room = { width: size.width - INSET * 2, height: size.height - INSET * 2 };
    const width = Math.min(room.width, room.height * aspect);
    const height = width / aspect;
    return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
  })();

  const cornerAt = (point: Point): Corner | null => {
    const corners: [Corner, number, number][] = [
      ["tl", crop.x, crop.y],
      ["tr", crop.x + crop.width, crop.y],
      ["bl", crop.x, crop.y + crop.height],
      ["br", crop.x + crop.width, crop.y + crop.height],
    ];
    let nearest: Corner | null = null;
    let best = GRAB;
    for (const [corner, x, y] of corners) {
      const distance = Math.hypot((point.x - x) * frame.width, (point.y - y) * frame.height);
      if (distance <= best) {
        nearest = corner;
        best = distance;
      }
    }
    return nearest;
  };

  // 끄는 모서리는 맞은편 모서리에서 MIN_CROP 안쪽으로 넘어가지 못한다. 좌표는 이미 0~1 로 묶여 있다.
  const moveCorner = (corner: Corner, point: Point): Rect => {
    const right0 = crop.x + crop.width;
    const bottom0 = crop.y + crop.height;
    const left = corner === "tl" || corner === "bl" ? Math.min(point.x, right0 - MIN_CROP) : crop.x;
    const top = corner === "tl" || corner === "tr" ? Math.min(point.y, bottom0 - MIN_CROP) : crop.y;
    const right =
      corner === "tr" || corner === "br" ? Math.max(point.x, crop.x + MIN_CROP) : right0;
    const bottom =
      corner === "bl" || corner === "br" ? Math.max(point.y, crop.y + MIN_CROP) : bottom0;
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  type PointerLike = { clientX: number; clientY: number; currentTarget: unknown };
  const pointOf = (event: { nativeEvent: unknown }) => {
    const native = event.nativeEvent as PointerLike & { target?: unknown };
    const target = (native.currentTarget ?? native.target) as {
      getBoundingClientRect?: () => DOMRect;
    };
    const box = surface.current?.getBoundingClientRect?.() ?? target.getBoundingClientRect?.();
    return box ? toImagePoint(native.clientX, native.clientY, box, frame) : null;
  };
  const surface = useRef<{ getBoundingClientRect?: () => DOMRect } | null>(null);

  const onPointerDown = (event: { nativeEvent: unknown }) => {
    if (!mode) return;
    const point = pointOf(event);
    if (!point) return;
    // 손가락이 면 밖으로 나가도 획이 이어지게 포인터를 붙잡는다.
    const native = event.nativeEvent as {
      pointerId?: number;
      target?: { setPointerCapture?: (id: number) => void };
    };
    if (native.pointerId !== undefined) native.target?.setPointerCapture?.(native.pointerId);
    if (mode === "crop") {
      const corner = cornerAt(point);
      dragging.current = corner ? { kind: "corner", corner } : null;
      return;
    }
    dragging.current = { kind: "stroke" };
    points.current = [point];
    setLive([point]);
  };

  const onPointerMove = (event: { nativeEvent: unknown }) => {
    const drag = dragging.current;
    if (!drag) return;
    const point = pointOf(event);
    if (!point) return;
    if (drag.kind === "corner") {
      props.onCropChange(moveCorner(drag.corner, point));
      return;
    }
    const last = points.current[points.current.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < brushRadius / 3) return;
    points.current = [...points.current, point];
    setLive(points.current);
  };

  const onPointerUp = () => {
    const drag = dragging.current;
    dragging.current = null;
    if (drag?.kind === "stroke" && mode && mode !== "crop" && points.current.length > 0) {
      props.onStroke({ mode, radius: brushRadius, points: points.current });
    }
    points.current = [];
    setLive([]);
  };

  const brushPx = brushRadius * frame.width;

  return (
    <View
      ref={surface as never}
      testID="edit-surface"
      onLayout={onLayout}
      style={[styles.surface, props.dark ? styles.dark : styles.checker]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Image
        source={{ uri: imageUri }}
        resizeMode="contain"
        style={[
          styles.image,
          { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
        ]}
      />
      {(props.marks ?? []).flatMap((stroke, strokeIndex) =>
        stroke.points.map((point, index) => {
          const r = stroke.radius * frame.width;
          return (
            <View
              key={`mark-${strokeIndex}-${index}`}
              pointerEvents="none"
              style={[
                styles.mark,
                {
                  left: frame.x + point.x * frame.width - r,
                  top: frame.y + point.y * frame.height - r,
                  width: r * 2,
                  height: r * 2,
                  borderRadius: r,
                },
              ]}
            />
          );
        }),
      )}
      {live.map((point, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.brush,
            mode === "restore"
              ? styles.brushRestore
              : mode === "cover"
                ? styles.mark
                : styles.brushErase,
            {
              left: frame.x + point.x * frame.width - brushPx,
              top: frame.y + point.y * frame.height - brushPx,
              width: brushPx * 2,
              height: brushPx * 2,
              borderRadius: brushPx,
            },
          ]}
        />
      ))}
      {mode === "crop" ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.cropBox,
              {
                left: frame.x + crop.x * frame.width,
                top: frame.y + crop.y * frame.height,
                width: crop.width * frame.width,
                height: crop.height * frame.height,
              },
            ]}
          />
          {(
            [
              [crop.x, crop.y],
              [crop.x + crop.width, crop.y],
              [crop.x, crop.y + crop.height],
              [crop.x + crop.width, crop.y + crop.height],
            ] as const
          ).map(([x, y], index) => (
            <View
              key={index}
              style={[
                styles.handle,
                {
                  left: frame.x + x * frame.width - HANDLE,
                  top: frame.y + y * frame.height - HANDLE,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  // touchAction none: 터치 기기 브라우저가 문지르기를 스크롤로 가로채 획을 끊지 않게 한다.
  surface: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    touchAction: "none",
  },
  // 지운 곳이 보이도록 격자 무늬를 깐다. 웹 전용 스타일이라 아이폰에서는 단색이 남는다.
  checker: {
    backgroundColor: "#F2F1EF",
    backgroundImage: "repeating-conic-gradient(#E9E7E3 0% 25%, #FAF9F7 0% 50%)",
    backgroundSize: "24px 24px",
  },
  dark: { backgroundColor: "#2B2829" },
  image: { position: "absolute" },
  brush: { position: "absolute", opacity: 0.45 },
  mark: { position: "absolute", backgroundColor: "#76736C" },
  brushErase: { backgroundColor: "#D9304F" },
  brushRestore: { backgroundColor: "#3D7BF5" },
  cropBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    boxShadow: "0 0 0 2000px rgba(0,0,0,0.38)",
  },
  handle: {
    position: "absolute",
    boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
    width: HANDLE * 2,
    height: HANDLE * 2,
    borderRadius: HANDLE,
    backgroundColor: "#fff",
  },
});

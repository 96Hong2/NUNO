import type { GarmentCategory } from "./garment-attributes";
import type { Rect } from "./geometry";

/**
 * 「트윈에 맞춰 볼게요」 에서 맞춘 옷 자리. 기준 상자 대비 비율이라 트윈이 바뀌어도 같은 자리에 놓인다.
 * x, y 는 상자 가운데에서 옷 가운데까지의 거리를 상자 폭과 높이로 나눈 값, scale 은 상자에 맞춘 크기 대비 배율이다.
 */
export interface Placement {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 };

const PLACEMENT_SCALE = { min: 0.7, max: 1.4, step: 0.05 } as const;
const PLACEMENT_Y_STEP = 0.02;
const PLACEMENT_Y_LIMIT = 0.24;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function nudgeScale(placement: Placement, direction: 1 | -1): Placement {
  const scale = placement.scale + direction * PLACEMENT_SCALE.step;
  return {
    ...placement,
    scale: round(Math.min(PLACEMENT_SCALE.max, Math.max(PLACEMENT_SCALE.min, scale))),
  };
}

/** 위치 ↑ 는 -1, ↓ 는 1 이다. */
export function nudgeY(placement: Placement, direction: 1 | -1): Placement {
  const y = placement.y + direction * PLACEMENT_Y_STEP;
  return { ...placement, y: round(Math.min(PLACEMENT_Y_LIMIT, Math.max(-PLACEMENT_Y_LIMIT, y))) };
}

/** 크기 칸의 「100%」 글자. */
export function scalePercent(placement: Placement): number {
  return Math.round(placement.scale * 100);
}

/** MediaPipe Pose 33점 가운데 상자를 잡는 데 쓰는 점 번호. 점은 [x, y, …] 비율 좌표다. */
const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type PosePoints = readonly (readonly number[])[];

function point(pose: PosePoints, index: number): { x: number; y: number } {
  const value = pose[index];
  return { x: value?.[0] ?? 0.5, y: value?.[1] ?? 0.5 };
}

/**
 * 종류마다 옷을 맞출 기준 상자. 어깨, 골반, 발목 점으로 잡는다.
 * 옷 그림은 이 상자 안에 비율을 지켜 맞춘 뒤 placement 로 옮기고 키운다.
 */
export function referenceBox(category: GarmentCategory, pose: PosePoints): Rect {
  const ls = point(pose, POSE.leftShoulder);
  const rs = point(pose, POSE.rightShoulder);
  const lh = point(pose, POSE.leftHip);
  const rh = point(pose, POSE.rightHip);
  const la = point(pose, POSE.leftAnkle);
  const ra = point(pose, POSE.rightAnkle);
  const nose = point(pose, POSE.nose);
  const shoulderX = (ls.x + rs.x) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const hipX = (lh.x + rh.x) / 2;
  const hipY = (lh.y + rh.y) / 2;
  const ankleX = (la.x + ra.x) / 2;
  const ankleY = (la.y + ra.y) / 2;
  const legLength = ankleY - hipY;
  const centered = (cx: number, top: number, width: number, height: number): Rect => ({
    x: cx - width / 2,
    y: top,
    width,
    height,
  });
  switch (category) {
    case "top":
      return centered(shoulderX, shoulderY - 0.04, shoulderWidth * 2.2, hipY - shoulderY + 0.1);
    case "outer":
      return centered(
        shoulderX,
        shoulderY - 0.04,
        shoulderWidth * 2.4,
        legLength * 0.6 + hipY - shoulderY,
      );
    case "bottom":
      return centered(hipX, hipY - 0.03, shoulderWidth * 1.3, legLength + 0.03);
    case "shoes":
      return centered(ankleX, ankleY - 0.04, shoulderWidth * 1.3, 0.08);
    case "bag":
      return centered(hipX + shoulderWidth * 0.9, hipY - 0.08, shoulderWidth * 0.8, 0.16);
    case "acc":
      return centered(nose.x, nose.y - 0.11, shoulderWidth * 0.9, 0.09);
  }
}

/** 옷 그림(가로 / 세로 비율 aspect)을 상자에 맞춰 놓을 자리. 그림 비율은 늘리지 않는다. */
export function placeGarment(box: Rect, placement: Placement, aspect: number): Rect {
  const safeAspect = aspect > 0 ? aspect : 1;
  const boxAspect = box.width / box.height;
  const fitWidth = safeAspect >= boxAspect ? box.width : box.height * safeAspect;
  const fitHeight = fitWidth / safeAspect;
  const width = fitWidth * placement.scale;
  const height = fitHeight * placement.scale;
  const cx = box.x + box.width / 2 + placement.x * box.width;
  const cy = box.y + box.height / 2 + placement.y * box.height;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

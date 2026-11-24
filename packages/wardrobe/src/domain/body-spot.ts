import type { Rect } from "./geometry";
import type { PosePoints } from "./placement";

/**
 * 견본 옷이 몸 위에 놓일 자리. 와이어프레임 v26 의 무대 자리 값(FXB)을 그대로 쓴다.
 * 값은 와이어프레임 기준 몸의 백분율이다. top 은 그림 위 끝, bottom 은 아래 끝, width 는 그림 폭이다.
 * centerX 를 비우면 몸 가운데(50)에 둔다.
 */
export interface BodySpot {
  top: number;
  bottom: number;
  width: number;
  centerX?: number;
}

/** 와이어프레임이 실사 트윈 사진에 쓰는 세로 보정표(REALY): 기준 몸 % → 하린 기본 사진 % */
const BASE_TO_HARIN: readonly (readonly [number, number])[] = [
  [0, 0],
  [12.4, 12],
  [16, 17],
  [20, 22],
  [42, 40],
  [58, 55],
  [69, 70],
  [92, 91],
  [98, 96.5],
  [100, 100],
];

/**
 * 하린 기본 사진(assets/twins/harin)의 몸 점. 다른 트윈은 이 점과 자기 점을 이어 옮긴다.
 * noseX 는 코의 가로 자리, width 는 어깨 폭, ear 는 두 귀 사이 폭이다.
 */
const HARIN = {
  noseX: 0.4925,
  nose: 0.1333,
  shoulder: 0.2227,
  hip: 0.4712,
  ankle: 0.875,
  width: 0.2148,
  ear: 0.083,
};

function harinY(base: number): number {
  for (let i = 1; i < BASE_TO_HARIN.length; i += 1) {
    const [x1, y1] = BASE_TO_HARIN[i] ?? [100, 100];
    if (base <= x1 || i === BASE_TO_HARIN.length - 1) {
      const [x0, y0] = BASE_TO_HARIN[i - 1] ?? [0, 0];
      return (y0 + ((base - x0) * (y1 - y0)) / (x1 - x0)) / 100;
    }
  }
  return base / 100;
}

const at = (pose: PosePoints, index: number) => ({
  x: pose[index]?.[0] ?? 0.5,
  y: pose[index]?.[1] ?? 0.5,
});

/**
 * 하린 사진의 세로 자리를 그 트윈 사진의 같은 몸 자리로 옮긴다.
 * 코, 어깨, 골반, 발목 사이는 마디마다 늘이고, 코 위와 발목 아래는 몸 길이 비율로 늘인다.
 */
function twinY(y: number, pose: PosePoints): number {
  const nose = at(pose, 0).y;
  const shoulder = (at(pose, 11).y + at(pose, 12).y) / 2;
  const hip = (at(pose, 23).y + at(pose, 24).y) / 2;
  const ankle = (at(pose, 27).y + at(pose, 28).y) / 2;
  const scale = (ankle - shoulder) / (HARIN.ankle - HARIN.shoulder);
  if (y <= HARIN.nose) return nose - (HARIN.nose - y) * scale;
  if (y >= HARIN.ankle) return ankle + (y - HARIN.ankle) * scale;
  const knots: readonly (readonly [number, number])[] = [
    [HARIN.nose, nose],
    [HARIN.shoulder, shoulder],
    [HARIN.hip, hip],
    [HARIN.ankle, ankle],
  ];
  for (let i = 1; i < knots.length; i += 1) {
    const [h1, t1] = knots[i] ?? [1, 1];
    if (y <= h1) {
      const [h0, t0] = knots[i - 1] ?? [0, 0];
      return t0 + ((y - h0) * (t1 - t0)) / (h1 - h0);
    }
  }
  return y;
}

/**
 * 견본 옷 그림을 그 트윈 사진 위에 놓을 자리(사진 대비 0~1 비율).
 * aspect 는 그림의 가로 / 세로 비율을 이 비율 좌표로 옮긴 값이다(그림 비율 / 사진 비율).
 * 폭은 어깨 폭 비율로 늘이고, 높이는 그림 비율로 정한다. 신발은 아래 끝을, 나머지는 위 끝을 붙인다.
 */
export function placeOnBody(
  spot: BodySpot,
  pose: PosePoints,
  aspect: number,
  edge: "top" | "bottom",
): Rect {
  const top = harinY(spot.top);
  const safeAspect = aspect > 0 ? aspect : 1;
  // 코보다 위에서 끝나는 옷(모자, 머리띠)은 머리 크기로 늘인다. 인형 트윈은 몸보다 머리가 크다.
  if (harinY(spot.bottom) < HARIN.nose) {
    const nose = at(pose, 0);
    const headScale = Math.abs(at(pose, 7).x - at(pose, 8).x) / HARIN.ear;
    const width = (spot.width / 100) * headScale;
    const fromNose = ((spot.centerX ?? 50) - 50) / 100 + 0.5 - HARIN.noseX;
    const x = nose.x + fromNose * headScale - width / 2;
    return { x, y: nose.y - (HARIN.nose - top) * headScale, width, height: width / safeAspect };
  }
  const ls = at(pose, 11);
  const rs = at(pose, 12);
  const centerX = (at(pose, 23).x + at(pose, 24).x) / 2;
  const widthScale = Math.abs(ls.x - rs.x) / HARIN.width;
  const width = (spot.width / 100) * widthScale;
  const height = width / safeAspect;
  const x = centerX + (((spot.centerX ?? 50) - 50) / 100) * widthScale - width / 2;
  const y = edge === "top" ? twinY(top, pose) : twinY(harinY(spot.bottom), pose) - height;
  return { x, y, width, height };
}

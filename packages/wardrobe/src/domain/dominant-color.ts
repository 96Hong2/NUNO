import { GARMENT_COLORS, type GarmentColor } from "./garment-attributes";

/** 이보다 투명한 점은 지운 배경으로 보고 세지 않는다. */
const OPAQUE_ALPHA = 128;

/**
 * 누끼 그림 점(RGBA 순서로 이어진 값)에서 가장 넓게 칠해진 색 칩을 고른다.
 * 점마다 가장 가까운 칩에 한 표를 준다. 보이는 점이 없으면 null 이다.
 * stride 는 몇 점마다 하나씩 셀지다. 큰 그림을 빨리 세려고 쓴다.
 */
export function pickGarmentColor(rgba: ArrayLike<number>, stride = 1): GarmentColor | null {
  const votes = new Map<GarmentColor, number>();
  const step = Math.max(1, Math.floor(stride)) * 4;
  for (let i = 0; i + 3 < rgba.length; i += step) {
    if ((rgba[i + 3] ?? 0) < OPAQUE_ALPHA) continue;
    const color = nearestColor(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
    votes.set(color, (votes.get(color) ?? 0) + 1);
  }
  let best: GarmentColor | null = null;
  let bestVotes = 0;
  for (const { key } of GARMENT_COLORS) {
    const count = votes.get(key) ?? 0;
    if (count > bestVotes) {
      best = key;
      bestVotes = count;
    }
  }
  return best;
}

/** sRGB 0~255 를 CIE Lab 으로 바꾼다(D65). 짙은 갈색이 검정으로 가지 않게 밝기와 색을 따로 본다. */
function toLab(r: number, g: number, b: number): [number, number, number] {
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const CHIP_LAB = GARMENT_COLORS.map(({ key, rgb }) => ({
  key,
  lab: toLab(rgb[0], rgb[1], rgb[2]),
}));

function nearestColor(r: number, g: number, b: number): GarmentColor {
  const [l, a, bb] = toLab(r, g, b);
  let best: GarmentColor = GARMENT_COLORS[0].key;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const { key, lab } of CHIP_LAB) {
    const distance = (l - lab[0]) ** 2 + (a - lab[1]) ** 2 + (bb - lab[2]) ** 2;
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}

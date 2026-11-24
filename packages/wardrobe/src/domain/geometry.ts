/** 사진 폭과 높이를 1 로 둔 비율 좌표의 네모. 원점은 왼쪽 위다. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 붓 자국 하나. 점은 비율 좌표, radius 는 사진 폭 대비 비율이다. */
export interface BrushStroke {
  mode: "erase" | "restore" | "cover";
  radius: number;
  points: readonly { x: number; y: number }[];
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 점에서 선분까지 거리(사진 폭 대비 비율). 붓 반지름이 폭 대비라 세로 좌표는 heightRatio(높이 / 폭)를 곱해 같은 잣대로 잰다.
 */
function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  heightRatio: number,
): number {
  const ax = a.x;
  const ay = a.y * heightRatio;
  const dx = b.x - ax;
  const dy = b.y * heightRatio - ay;
  const px = p.x;
  const py = p.y * heightRatio;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function coveredByStrokes(
  point: { x: number; y: number },
  strokes: readonly BrushStroke[],
  heightRatio: number,
): boolean {
  return strokes.some(
    (stroke) =>
      stroke.mode === "cover" &&
      stroke.points.some((current, index) => {
        const previous = stroke.points[index - 1] ?? current;
        return distanceToSegment(point, previous, current, heightRatio) <= stroke.radius;
      }),
  );
}

/** 얼굴 네모 가운데 잘라 낸 네모 안에 들고 붓으로 가리지 않은 몫(0~1). heightRatio 는 사진 높이 / 폭이다. */
function visibleFaceShare(
  crop: Rect,
  face: Rect,
  covers: readonly BrushStroke[],
  heightRatio: number,
  grid = 12,
): number {
  if (overlapArea(crop, face) === 0) return 0;
  let visible = 0;
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const point = {
        x: face.x + ((column + 0.5) / grid) * face.width,
        y: face.y + ((row + 0.5) / grid) * face.height,
      };
      const inCrop =
        point.x >= crop.x &&
        point.x <= crop.x + crop.width &&
        point.y >= crop.y &&
        point.y <= crop.y + crop.height;
      if (inCrop && !coveredByStrokes(point, covers, heightRatio)) visible += 1;
    }
  }
  return visible / (grid * grid);
}

/** 얼굴이 이 몫보다 적게 보이면 「옷만 보이도록 잘라 주세요」 를 넘어간다. 이마나 턱 끝이 조금 걸린 것은 봐준다. */
const FACE_VISIBLE_LIMIT = 0.1;

/** heightRatio 는 사진 높이 / 폭이다. 세로 사진에서 붓이 실제보다 넓게 가린 것으로 세지 않게 한다. */
export function faceStillVisible(
  crop: Rect,
  face: Rect | null,
  covers: readonly BrushStroke[] = [],
  heightRatio = 1,
): boolean {
  return face !== null && visibleFaceShare(crop, face, covers, heightRatio) >= FACE_VISIBLE_LIMIT;
}

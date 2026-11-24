import type {
  BrushStroke,
  GarmentEdits,
  GarmentMedia,
  PreparedPhoto,
  RenderedGarment,
  StoredGarmentFiles,
} from "@nuno/wardrobe";
import { GARMENT_FIXTURES } from "./garment-fixtures.web";

/**
 * 웹 옷 그림 어댑터. 아이폰의 Apple Vision 대신 쓴다.
 * - 고른 사진이 견본 원본과 같은 파일이면(SHA-256) 미리 만든 누끼를 쓴다.
 * - 견본이 아니면 네 귀퉁이 색을 배경으로 보고 이어진 영역을 지운다. 귀퉁이 색이 고르지 않으면 원본을 그대로 쓴다.
 * - 손본 값(자르기, 돌리기, 붓 자국)은 canvas 로 굽는다.
 * - 저장은 브라우저 OPFS 의 `garments/<옷 ID>/` 에 한다. 경로 규칙은 아이폰 앱 문서 폴더와 같다.
 */

const MAX_SIDE = 1024;
const THUMB_SIDE = 400;
const PIXEL_SIDE = 64;
/** 귀퉁이 색과 이만큼 가까운 점을 배경으로 본다(RGB 거리). */
const BACKGROUND_TOLERANCE = 42;
/** 네 귀퉁이 색이 서로 이만큼보다 멀면 배경이 고르지 않다고 보고 지우지 않는다. */
const CORNER_SPREAD_LIMIT = 60;

const blobs = new Map<string, Blob>();

function remember(blob: Blob): string {
  const uri = URL.createObjectURL(blob);
  blobs.set(uri, blob);
  return uri;
}

async function blobOf(uri: string): Promise<Blob> {
  const known = blobs.get(uri);
  if (known) return known;
  const response = await fetch(uri);
  return response.blob();
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

function context(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = element.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d 를 열지 못했다");
  return ctx;
}

function toBlob(element: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    element.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("그림을 굽지 못했다"))),
      type,
      quality,
    );
  });
}

/** 긴 변이 limit 을 넘지 않게 줄인 크기 */
function fit(width: number, height: number, limit: number) {
  const ratio = Math.min(1, limit / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function cornerColors(data: Uint8ClampedArray, width: number, height: number): number[][] {
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };
  return [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
}

const distance = (a: number[], b: number[]) =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

/** 가장자리에서 이어진 배경색 영역을 투명하게 만든다. 배경이 고르지 않으면 null. */
function removeFlatBackground(image: ImageBitmap): HTMLCanvasElement | null {
  const size = fit(image.width, image.height, MAX_SIDE);
  const out = canvas(size.width, size.height);
  const ctx = context(out);
  ctx.drawImage(image, 0, 0, size.width, size.height);
  const frame = ctx.getImageData(0, 0, size.width, size.height);
  const { data, width, height } = frame;
  const corners = cornerColors(data, width, height);
  const spread = Math.max(...corners.map((a) => Math.max(...corners.map((b) => distance(a, b)))));
  if (spread > CORNER_SPREAD_LIMIT) return null;
  const background = [0, 1, 2].map(
    (c) => corners.reduce((sum, color) => sum + (color[c] ?? 0), 0) / 4,
  );
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;
    const i = index * 4;
    const color = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    if (distance(color, background) > BACKGROUND_TOLERANCE) return;
    data[i + 3] = 0;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  ctx.putImageData(frame, 0, 0);
  return out;
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  stroke: BrushStroke,
  width: number,
  height: number,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.radius * 2 * width;
  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y);
    } else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/**
 * 붓 자국을 원본 크기 그림에 칠한다. 지우기와 가리기는 투명하게, 되살리기는 원본을 되돌린다.
 * 가리기 자국은 끝에 한 번 더 지운다. 뒤에 칠한 되살리기가 가린 얼굴을 되돌리지 못하게 한다.
 */
function applyStrokes(
  target: HTMLCanvasElement,
  original: ImageBitmap,
  strokes: readonly BrushStroke[],
): void {
  const ctx = context(target);
  const { width, height } = target;
  const covers = strokes.filter((stroke) => stroke.mode === "cover");
  for (const stroke of [...strokes, ...covers]) {
    if (stroke.mode === "restore") {
      const patch = canvas(width, height);
      const patchCtx = context(patch);
      patchCtx.drawImage(original, 0, 0, width, height);
      patchCtx.globalCompositeOperation = "destination-in";
      patchCtx.strokeStyle = "#000";
      strokePath(patchCtx, stroke, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(patch, 0, 0);
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
      strokePath(ctx, stroke, width, height);
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

/** 보이는 점이 든 가장 작은 네모. 다 투명하면 전체. */
function opaqueBounds(element: HTMLCanvasElement) {
  const { width, height } = element;
  const { data } = context(element).getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function bitmap(uri: string): Promise<ImageBitmap> {
  return createImageBitmap(await blobOf(uri));
}

interface RenderOptions {
  /** 투명한 가장자리를 잘라 옷만 남긴다. 「다음」 으로 넘길 때 켠다. */
  trim: boolean;
}

async function renderEdits(
  photo: PreparedPhoto,
  edits: GarmentEdits,
  options: RenderOptions,
): Promise<RenderedGarment> {
  const original = await bitmap(photo.originalUri);
  const cutout = await bitmap(photo.cutoutUri);
  const base = fit(original.width, original.height, MAX_SIDE);
  const work = canvas(base.width, base.height);
  context(work).drawImage(cutout, 0, 0, base.width, base.height);
  applyStrokes(work, original, edits.strokes);

  const crop = edits.crop;
  const cropped = canvas(crop.width * base.width, crop.height * base.height);
  context(cropped).drawImage(work, -crop.x * base.width, -crop.y * base.height);

  const turned = edits.rotation % 180 === 0;
  const rotated = canvas(
    turned ? cropped.width : cropped.height,
    turned ? cropped.height : cropped.width,
  );
  const rotatedCtx = context(rotated);
  rotatedCtx.translate(rotated.width / 2, rotated.height / 2);
  rotatedCtx.rotate((edits.rotation * Math.PI) / 180);
  rotatedCtx.drawImage(cropped, -cropped.width / 2, -cropped.height / 2);

  let result = rotated;
  if (options.trim) {
    const bounds = opaqueBounds(rotated);
    result = canvas(bounds.width, bounds.height);
    context(result).drawImage(rotated, -bounds.x, -bounds.y);
  }
  const small = fit(result.width, result.height, PIXEL_SIDE);
  const sample = canvas(small.width, small.height);
  const sampleCtx = context(sample);
  sampleCtx.drawImage(result, 0, 0, small.width, small.height);
  const pixels = sampleCtx.getImageData(0, 0, small.width, small.height).data;
  return {
    cutoutUri: remember(await toBlob(result)),
    aspect: result.width / result.height,
    pixels,
  };
}

async function opfsDirectory(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let directory = await navigator.storage.getDirectory();
  for (const name of path.split("/").filter(Boolean)) {
    directory = await directory.getDirectoryHandle(name, { create });
  }
  return directory;
}

async function writeFile(path: string, blob: Blob): Promise<void> {
  const parts = path.split("/");
  const name = parts.pop() ?? "";
  const directory = await opfsDirectory(parts.join("/"), true);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

const resolved = new Map<string, string>();

export const garmentMedia: GarmentMedia = {
  editable: true,

  async prepare(photoUri) {
    const blob = await blobOf(photoUri);
    const originalUri = remember(blob);
    const original = await createImageBitmap(blob);
    const fixture = GARMENT_FIXTURES[await sha256(blob)];
    if (fixture) {
      return {
        originalUri,
        cutoutUri: fixture.cutoutUri,
        cutoutSource: "fixture",
        face: fixture.face,
        hadPerson: fixture.face !== null,
        width: original.width,
        height: original.height,
      };
    }
    const flat = removeFlatBackground(original);
    return {
      originalUri,
      cutoutUri: flat ? remember(await toBlob(flat)) : originalUri,
      cutoutSource: flat ? "simple" : "none",
      face: null,
      hadPerson: false,
      width: original.width,
      height: original.height,
    };
  },

  render: (photo, edits) => renderEdits(photo, edits, { trim: true }),

  release(uri) {
    if (!blobs.has(uri)) return;
    blobs.delete(uri);
    URL.revokeObjectURL(uri);
  },

  renderPreview: (photo, edits) => renderEdits(photo, edits, { trim: false }),

  async store(id, photo, rendered): Promise<StoredGarmentFiles> {
    const directory = `garments/${id}`;
    const paths = {
      originalPath: `${directory}/original.jpg`,
      cutoutPath: `${directory}/cutout.png`,
      thumbPath: `${directory}/thumb.png`,
    };
    const original = await bitmap(photo.originalUri);
    const originalSize = fit(original.width, original.height, 2048);
    const originalCanvas = canvas(originalSize.width, originalSize.height);
    context(originalCanvas).drawImage(original, 0, 0, originalSize.width, originalSize.height);
    // canvas 로 다시 구우면 사진의 위치 정보(EXIF)가 남지 않는다.
    await writeFile(paths.originalPath, await toBlob(originalCanvas, "image/jpeg", 0.9));
    const cutoutBlob = await blobOf(rendered.cutoutUri);
    await writeFile(paths.cutoutPath, cutoutBlob);
    const cutout = await createImageBitmap(cutoutBlob);
    const thumbSize = fit(cutout.width, cutout.height, THUMB_SIDE);
    const thumb = canvas(thumbSize.width, thumbSize.height);
    context(thumb).drawImage(cutout, 0, 0, thumbSize.width, thumbSize.height);
    await writeFile(paths.thumbPath, await toBlob(thumb));
    return paths;
  },

  async resolve(path) {
    const cached = resolved.get(path);
    if (cached) return cached;
    const parts = path.split("/");
    const name = parts.pop() ?? "";
    const directory = await opfsDirectory(parts.join("/"), false);
    const file = await (await directory.getFileHandle(name)).getFile();
    const uri = remember(file);
    resolved.set(path, uri);
    return uri;
  },

  async remove(id) {
    const garments = await opfsDirectory("garments", true);
    await garments.removeEntry(id, { recursive: true }).catch(() => undefined);
    for (const [path, uri] of resolved) {
      if (path.startsWith(`garments/${id}/`)) {
        URL.revokeObjectURL(uri);
        resolved.delete(path);
      }
    }
  },
};

// 채점 폴더에 넣는 그림의 메타데이터(촬영 정보, 만든 프로그램, 글 덩어리)를 지운다.
// 그림 처리 의존성 없이 파일 구조만 보고 덩어리를 뺀다. JPEG, PNG 밖의 형식은 멈춘다.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** 그림을 그리는 데 필요한 PNG 덩어리. 나머지(tEXt, iTXt, zTXt, eXIf, tIME 등)는 뺀다. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

export type ImageKind = "jpeg" | "png";

export function imageKind(bytes: Uint8Array): ImageKind {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return "png";
  throw new Error("JPEG 이나 PNG 가 아니다. 다른 형식은 메타데이터를 지우는 법을 정한 뒤 받는다");
}

export function stripMetadata(bytes: Uint8Array): { kind: ImageKind; bytes: Uint8Array } {
  const kind = imageKind(bytes);
  return { kind, bytes: kind === "jpeg" ? stripJpeg(bytes) : stripPng(bytes) };
}

/**
 * JPEG: APP0~APP15 와 COM 덩어리를 뺀다. 화상 데이터(SOS 뒤)는 그대로 둔다.
 * 색 프로파일(APP2 ICC)과 Adobe 색 변환(APP14)은 남긴다. 빼면 색이 달라 보여 「옷 색이 다름」 채점이 흔들린다.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) throw new Error("JPEG 덩어리 표시가 어긋났다");
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xda) {
      out.push(bytes.subarray(at));
      return concat(out);
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    const end = at + 2 + length;
    const color = marker === 0xe2 || marker === 0xee;
    const metadata = ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) && !color;
    if (!metadata) out.push(bytes.subarray(at, end));
    at = end;
  }
  throw new Error("JPEG 에 화상 데이터(SOS)가 없다");
}

/** PNG: 그리는 데 필요한 덩어리만 남긴다. */
function stripPng(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    if (PNG_KEEP.has(type)) out.push(bytes.subarray(at, end));
    if (type === "IEND") return concat(out);
    at = end;
  }
  throw new Error("PNG 끝(IEND)이 없다");
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

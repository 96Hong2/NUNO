// 채점 폴더에 넣는 그림의 메타데이터(촬영 정보, 만든 프로그램, 글 덩어리)를 지운다.
// 그림 처리 의존성 없이 파일 구조만 따라 걸으며 덩어리를 뺀다. JPEG, PNG 밖의 형식은 멈춘다.

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
  const pieces = kind === "jpeg" ? walkJpeg(bytes) : walkPng(bytes);
  return { kind, bytes: concat(pieces.filter((piece) => piece.keep).map((piece) => piece.bytes)) };
}

/**
 * 구조를 따라 걸어 남아 있는 메타데이터 덩어리 이름을 돌려준다(D5 검사용).
 * 화상 데이터 안의 우연한 글자는 보지 않는다. JPEG 끝(EOI) 뒤에 남은 바이트도 문제로 돌려준다.
 */
export function metadataLeft(bytes: Uint8Array): string[] {
  const kind = imageKind(bytes);
  const pieces = kind === "jpeg" ? walkJpeg(bytes) : walkPng(bytes);
  return pieces.filter((piece) => !piece.keep).map((piece) => piece.name);
}

interface Piece {
  name: string;
  bytes: Uint8Array;
  keep: boolean;
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

/**
 * 색 정보는 남긴다. 빼면 색이 달라 보여 「옷 색이 다름」 채점이 흔들린다.
 * APP2 는 ICC 프로파일만(MPF 같은 다른 APP2 는 뺀다), APP14 는 Adobe 색 변환만 남긴다.
 */
function keepApp(bytes: Uint8Array, at: number, marker: number): boolean {
  if (marker === 0xe2) return ascii(bytes, at + 4, 12) === "ICC_PROFILE\0";
  if (marker === 0xee) return ascii(bytes, at + 4, 5) === "Adobe";
  return false;
}

/**
 * JPEG 을 처음부터 EOI 까지 걷는다. SOS 뒤 화상 데이터는 FF00(채움)과 RST(FFD0~FFD7)를 데이터로 넘기며 다음 표지까지 간다.
 * 스캔 사이(프로그레시브)의 APPn, COM 도 덩어리로 읽어 뺀다. EOI 뒤 바이트(덧붙은 둘째 그림 등)는 뺀다.
 */
function walkJpeg(bytes: Uint8Array): Piece[] {
  const pieces: Piece[] = [{ name: "SOI", bytes: bytes.subarray(0, 2), keep: true }];
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error("JPEG 덩어리 표시가 어긋났다");
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // 표지 앞 채움 바이트
      continue;
    }
    if (marker === 0xd9) {
      pieces.push({ name: "EOI", bytes: bytes.subarray(at, at + 2), keep: true });
      if (at + 2 < bytes.length) {
        pieces.push({ name: "EOI 뒤 데이터", bytes: bytes.subarray(at + 2), keep: false });
      }
      return pieces;
    }
    if (at + 4 > bytes.length) throw new Error("JPEG 이 덩어리 도중에 끝났다");
    const end = at + 2 + (((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0));
    if (end > bytes.length) throw new Error("JPEG 덩어리 길이가 파일보다 길다");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const metadata = (isApp && !keepApp(bytes, at, marker)) || marker === 0xfe;
    const name =
      marker === 0xfe ? "COM" : isApp ? `APP${marker - 0xe0}` : `FF${marker.toString(16)}`;
    pieces.push({ name, bytes: bytes.subarray(at, end), keep: !metadata });
    at = end;
    if (marker === 0xda) {
      // 화상 데이터: 다음 표지(FF 뒤가 00, RST, FF 가 아닌 것)까지
      let scan = at;
      while (scan < bytes.length) {
        const next = bytes[scan + 1] ?? 0;
        const isMarker =
          bytes[scan] === 0xff && next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7);
        if (isMarker) break;
        scan += 1;
      }
      pieces.push({ name: "화상 데이터", bytes: bytes.subarray(at, scan), keep: true });
      at = scan;
    }
  }
  throw new Error("JPEG 끝(EOI)이 없다");
}

function walkPng(bytes: Uint8Array): Piece[] {
  const pieces: Piece[] = [{ name: "서명", bytes: bytes.subarray(0, 8), keep: true }];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const type = ascii(bytes, at + 4, 4);
    const end = at + 12 + view.getUint32(at);
    if (end > bytes.length) throw new Error("PNG 덩어리 길이가 파일보다 길다");
    pieces.push({ name: type, bytes: bytes.subarray(at, end), keep: PNG_KEEP.has(type) });
    if (type === "IEND") {
      if (end < bytes.length) {
        pieces.push({ name: "IEND 뒤 데이터", bytes: bytes.subarray(end), keep: false });
      }
      return pieces;
    }
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

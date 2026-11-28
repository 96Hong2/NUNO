import { createHash } from "node:crypto";

/** 옷 사진 한 장의 크기 상한. 앱의 배경을 지운 PNG 와 긴 변 2,048 JPEG 가 넉넉히 들어간다. */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** 한 사용자가 한국 시간 하루에 발급받는 올리기 줄 상한. */
export const UPLOADS_PER_DAY = 200;

export type UploadFormat = { contentType: "image/png" | "image/jpeg"; extension: "png" | "jpg" };

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG 끝 조각: 길이 0, 「IEND」, CRC */
const PNG_TAIL = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

const startsWith = (bytes: Uint8Array, head: readonly number[]) =>
  bytes.length >= head.length && head.every((b, i) => bytes[i] === b);
const endsWith = (bytes: Uint8Array, tail: readonly number[]) =>
  bytes.length >= tail.length && tail.every((b, i) => bytes[bytes.length - tail.length + i] === b);

/**
 * 머리 바이트와 끝 표시로 PNG, JPEG 를 가린다. 둘 다 아니거나 끝이 잘렸으면 null.
 * 그림을 풀어 보지는 않는다. 공급사에 보낼 수 있는 꼴인지만 본다.
 */
export function uploadFormat(bytes: Uint8Array): UploadFormat | null {
  if (startsWith(bytes, PNG_HEAD) && endsWith(bytes, PNG_TAIL)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff]) && endsWith(bytes, [0xff, 0xd9])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  return null;
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** 확정 때의 파일 키. 스키마 v5 「R2 비공개 버킷」 의 `job-in/<사용자 ID>/<올리기 ID>/` 아래 해시 이름이다. */
export const uploadKey = (userId: string, uploadId: string, sha256: string, format: UploadFormat) =>
  `job-in/${userId}/${uploadId}/${sha256}.${format.extension}`;

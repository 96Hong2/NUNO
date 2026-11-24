import { createHash } from "node:crypto";

/** 키를 정렬한 JSON. 같은 입력이면 키 순서가 달라도 같은 글이 된다. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 같은 생성 요청 ID 에 다른 입력이 왔는지 가리는 값. 입력 목록의 SHA-256(hex) 이다. */
export function requestHash(manifest: unknown): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

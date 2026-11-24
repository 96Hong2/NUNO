import { Hono } from "hono";
import { verifyFileUrl } from "./signed-url.ts";

export interface FileRoutesDeps {
  secret: string;
  read: (key: string) => Promise<Uint8Array | null>;
  now: () => Date;
}

const PREFIX = "/v1/files/";

/** 그림 머리 바이트로 형식을 고른다. 키의 확장자는 형식과 다를 수 있다(개발용 가짜 그림은 webp). */
function contentType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

/** 로컬 디스크 결과 저장의 서명 주소. 서명이 틀리거나 기한이 지나면 403, 파일이 없으면 404. */
export function fileRoutes({ secret, read, now }: FileRoutesDeps): Hono {
  const routes = new Hono();
  routes.get(`${PREFIX}*`, async (c) => {
    // 풀지 않은 경로를 그대로 키로 본다. %2F 같은 글자는 키 꼴 검사에서 떨어진다.
    const key = new URL(c.req.url).pathname.slice(PREFIX.length);
    if (!verifyFileUrl(secret, key, c.req.query("exp"), c.req.query("sig"), now())) {
      return c.json({ error: "forbidden" }, 403);
    }
    const bytes = await read(key);
    if (!bytes) return c.json({ error: "not_found" }, 404);
    return c.body(Buffer.from(bytes), 200, {
      "Content-Type": contentType(bytes),
      "Cache-Control": "private, no-store",
    });
  });
  return routes;
}

import type { Context } from "hono";

/** 본문이 JSON 객체가 아니면 null. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** 비어 있지 않고 max 글자 안의 문자열이면 그 값, 아니면 null. */
export const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

export const badRequest = (c: Context, error: string) => c.json({ error }, 400);

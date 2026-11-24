// NUNO API 서버 부르기. 서버 주소는 빌드 때 EXPO_PUBLIC_API_URL 로 넣는다. 없으면 서버가 없는 빌드다.

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export function hasApiServer(): boolean {
  return BASE_URL !== "";
}

/** 성공이면 본문, 실패면 서버 오류 코드(`error`)를 그대로 준다. 닿지 못하면 `network`, 주소가 없으면 `no_server`. */
export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

interface ApiRequest {
  method?: "GET" | "POST";
  token?: string | null;
  body?: unknown;
}

export async function apiRequest<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  if (!hasApiServer()) return { ok: false, status: 0, error: "no_server" };
  const headers: Record<string, string> = {};
  if (request.token) headers.Authorization = `Bearer ${request.token}`;
  if (request.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
  const text = await response.text().catch(() => "");
  const data = parseJson(text);
  if (response.ok) return { ok: true, status: response.status, data: data as T };
  const code = (data as { error?: unknown } | null)?.error;
  return {
    ok: false,
    status: response.status,
    error: typeof code === "string" ? code : `http_${response.status}`,
  };
}

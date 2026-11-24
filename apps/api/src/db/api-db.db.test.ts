import { afterAll, describe, expect, it } from "vitest";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp } from "../app.ts";

// 실제 Postgres 에 붙는 시험. scripts/test-db.mjs 가 컨테이너를 띄우고 판을 적용한 뒤 주소를 넘긴다.
const apiUrl = process.env.TEST_DATABASE_API_URL;
if (!apiUrl) throw new Error("TEST_DATABASE_API_URL 이 없다. pnpm test:db 로 돌린다");
const api = openPostgres(apiUrl);
const app = createApp(api);
afterAll(() => api.close());

const pgError = (error: unknown) => (error as { code?: string }).code;

describe("API 와 DB 권한(nuno_api 로 접속)", () => {
  it("상태 확인 주소가 200 과 판 번호 1 을 준다", async () => {
    const response = await app.request("/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, schemaVersion: 1 });
  });

  it("기능 스위치 조회 주소가 feature_switches 행을 준다", async () => {
    const response = await app.request("/v1/feature-switches");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { switches: { key: string; enabled: boolean }[] };
    expect(body.switches).toContainEqual(
      expect.objectContaining({ key: "generate_look", enabled: false }),
    );
  });

  it("스위치를 바꾸는 공개 주소는 없다", async () => {
    for (const method of ["PATCH", "PUT", "POST", "DELETE"]) {
      const response = await app.request("/v1/feature-switches/generate_look", { method });
      expect(response.status).toBe(404);
    }
  });

  it("nuno_api 로 스위치를 직접 update 하면 권한 오류가 난다", async () => {
    const error = await api
      .query("UPDATE feature_switches SET enabled = true WHERE key = 'generate_look'")
      .catch((caught: unknown) => caught);
    expect(pgError(error)).toBe("42501");
  });

  it("nuno_api 권한은 스위치 이름과 켜짐 읽기, 공급사 설정 읽기, 판 번호 읽기뿐이다", async () => {
    // 기대값은 스키마 v1 「RLS 요지」: 앱 쪽은 스위치 읽기만, 공급사 설정은 서버만.
    const expected = [
      ["feature_switches", "SELECT", false],
      ["feature_switches", "UPDATE", false],
      ["feature_switches", "INSERT", false],
      ["provider_configs", "SELECT", true],
      ["provider_configs", "UPDATE", false],
      ["provider_configs", "INSERT", false],
      ["schema_migrations", "SELECT", true],
      ["schema_migrations", "INSERT", false],
    ] as const;
    for (const [table, privilege, allowed] of expected) {
      const [row] = await api.query<{ ok: boolean }>("SELECT has_table_privilege($1, $2) AS ok", [
        table,
        privilege,
      ]);
      expect({ table, privilege, ok: row?.ok }).toEqual({ table, privilege, ok: allowed });
    }
    const columns = await api.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.column_privileges WHERE table_name = 'feature_switches' AND grantee = 'nuno_api' AND privilege_type = 'SELECT' ORDER BY column_name",
    );
    expect(columns.map((row) => row.column_name)).toEqual(["enabled", "key"]);
  });
});

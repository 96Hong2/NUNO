import { serve } from "@hono/node-server";
import { openPostgres } from "../adapters/postgres.ts";
import { createApp } from "../app.ts";

// API 서버 시작점. DATABASE_URL 은 nuno_api 접속 주소다(비밀번호 포함, 저장소에 두지 않는다).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 이 없다. nuno_api 접속 주소를 환경 변수로 넣는다");
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(openPostgres(url)).fetch, port });
console.log(`API 서버: http://localhost:${port}`);

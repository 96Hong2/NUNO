import { openPostgres } from "../adapters/postgres.ts";
import { migrate } from "../db/migrate.ts";

// 판 옮기기 실행. DATABASE_ADMIN_URL 은 nuno_owner 의 구성원인 관리자 접속 주소다.
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL 이 없다. 관리자 접속 주소를 환경 변수로 넣는다");
const db = openPostgres(url);
try {
  const report = await migrate(db);
  console.log(`판 옮기기: ${report.from} → ${report.to}`);
} finally {
  await db.close();
}

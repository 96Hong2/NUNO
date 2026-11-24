#!/usr/bin/env node
// e2e 와 로컬 개발에 쓰는 API 서버를 띄운다. docker-compose.yml 의 postgres 서비스(로컬 개발 DB)를 쓴다.
//   node scripts/e2e-api.mjs        nuno_e2e DB 를 지우고 새로 만든다. playwright.config.ts 가 부른다.
//   node scripts/e2e-api.mjs --dev  nuno_dev DB 를 없을 때만 만든다(`pnpm api:dev`). 웹은 pnpm web(8090).
// 두 경우 모두 역할 설정, 판 옮기기, 시험용 준비(generate_look 켜기, 가짜 공급사 줄)를 한 뒤
// 개발 전용 주소를 켠 API 와 작업 worker 를 같은 환경으로 띄운다. 둘 중 하나가 죽으면 다른 것도 내린다.
// 운영 DB 의 스위치는 운영자 몫이라 이 스크립트가 닿지 않는다.
// 비밀번호는 docker-compose.yml 과 scripts/test-db.mjs 의 로컬 전용 값이다.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "postgres:nuno-local";
const API_PASSWORD = "nuno-api-local";
const DB_PORT = Number(process.env.NUNO_DB_PORT ?? 54329);
const dev = process.argv.includes("--dev");

// 결과 사진 서명 주소 키. 이 스크립트로 띄우는 로컬 서버에서만 쓰는 값이다.
const FILE_URL_SECRET = "nuno-local-file-url-secret";
// 가짜 공급사가 결과로 주는 그림: 하린 온보딩 착장 사진 한 장.
const FAKE_RESULT_IMAGE = join(root, "apps/mobile/assets/onboarding-looks/harin_w18_w14.webp");

const target = dev
  ? {
      db: "nuno_dev",
      port: 8787,
      origins: "http://localhost:8090",
      fresh: false,
      resultDir: join(root, "apps/api/.local-results/dev"),
    }
  : {
      db: "nuno_e2e",
      port: Number(process.env.NUNO_E2E_API_PORT ?? 8877),
      origins:
        process.env.NUNO_WEB_ORIGINS ?? `http://localhost:${process.env.NUNO_E2E_PORT ?? 8091}`,
      fresh: true,
      resultDir: join(root, "apps/api/.local-results/e2e"),
    };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`멈춤: ${command} ${args.join(" ")}`);
  }
  return result.stdout;
}

const psql = (db, sql, extra = []) =>
  run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-U",
      "postgres",
      "-d",
      db,
      ...extra,
    ],
    { input: sql },
  );
const url = (user, db) => `postgres://${user}@localhost:${DB_PORT}/${db}`;

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error("Docker 가 꺼져 있다. Docker 를 켠 뒤 다시 돌린다.");
  process.exit(1);
}

// 떠 있으면 그대로 두고, 없으면 띄워 건강 확인까지 기다린다.
run("docker", ["compose", "up", "-d", "--wait", "postgres"]);

const exists =
  psql("nuno", `SELECT 1 FROM pg_database WHERE datname = '${target.db}';`, ["-t", "-A"]).trim() ===
  "1";
if (target.fresh && exists) psql("nuno", `DROP DATABASE ${target.db} WITH (FORCE);`);
if (target.fresh || !exists) psql("nuno", `CREATE DATABASE ${target.db};`);

psql(target.db, readFileSync(join(root, "apps/api/db/setup.sql"), "utf8"));
psql(target.db, `ALTER ROLE nuno_api PASSWORD '${API_PASSWORD}';`);
run("node", ["apps/api/src/composition/run-migrations.ts"], {
  env: { ...process.env, DATABASE_ADMIN_URL: url(ADMIN, target.db) },
  stdio: ["ignore", "inherit", "inherit"],
});

// 시험용 준비. 가짜 공급사는 이 DB 에서만 켠다.
psql(
  target.db,
  `UPDATE feature_switches
     SET enabled = true, reason = '로컬 시험 DB', updated_by = 'scripts/e2e-api.mjs', updated_at = now()
   WHERE key = 'generate_look';
   INSERT INTO provider_configs
     (provider, model, model_version, mode, priority, country, max_concurrency, price_usd, enabled)
   VALUES ('fake', 'fake', '1', 'sync', 1, '대한민국', 4, 0.04, true)
   ON CONFLICT (provider, model, model_version, mode) DO NOTHING;`,
);

const serverEnv = {
  ...process.env,
  DATABASE_URL: url(`nuno_api:${API_PASSWORD}`, target.db),
  NUNO_DEV_ROUTES: "1",
  NUNO_WEB_ORIGINS: target.origins,
  PORT: String(target.port),
  NUNO_PUBLIC_API_URL: `http://localhost:${target.port}`,
  NUNO_RESULT_DIR: target.resultDir,
  NUNO_FILE_URL_SECRET: FILE_URL_SECRET,
  NUNO_FAKE_RESULT_IMAGE: FAKE_RESULT_IMAGE,
};

// 함께 띄우는 프로세스. API 와 worker 는 같은 DB, 결과 폴더, 서명 키를 쓴다.
const processes = [
  ["api", ["apps/api/src/composition/main.ts"]],
  ["worker", ["apps/api/src/composition/worker.ts"]],
].map(([name, args]) => {
  const child = spawn(process.execPath, args, { cwd: root, env: serverEnv, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.error(`${name} 가 끝났다(코드 ${code}, 신호 ${signal}). 나머지도 내린다`);
    stopAll(code ?? 1);
  });
  return child;
});

function stopAll(code) {
  for (const child of processes) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

console.log(
  `DB ${target.db}, API http://localhost:${target.port}, worker, 웹 출처 ${target.origins}, 결과 폴더 ${target.resultDir}`,
);

#!/usr/bin/env node
// `pnpm test:db`: 실제 Postgres 에 붙는 DB 시험을 돈다. docker-compose.yml 의 test-a, test-b 를 nuno-test 이름으로 띄운다.
// 1. test-a: 역할 설정(apps/api/db/setup.sql), 판 옮기기를 적용하고 DB 시험을 돈다.
// 2. test-b: 역할만 만든 다른 Postgres 에 test-a 의 pg_dump 를 넣는다. 판 옮기기를 돌리지 않고 같은 DB 시험을 돈다.
// 끝나면 두 컨테이너를 지운다. 로컬 개발 DB(postgres 서비스)는 건드리지 않는다.
// `pnpm db:local`(--local): 로컬 개발 DB nuno 에 역할과 판만 적용한다.
// Docker 가 없으면 건너뛰지 않고 멈춘다. 비밀번호는 docker-compose.yml 과 여기의 로컬 전용 값이다.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "postgres:nuno-local";
const API_PASSWORD = "nuno-api-local";
const local = process.argv.includes("--local");
const project = local ? ["compose"] : ["compose", "-p", "nuno-test", "--profile", "test"];
const PORTS = {
  postgres: Number(process.env.NUNO_DB_PORT ?? 54329),
  "test-a": Number(process.env.NUNO_TEST_DB_PORT ?? 54330),
  "test-b": Number(process.env.NUNO_TEST_RESTORE_PORT ?? 54331),
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

const docker = (args, options) => run("docker", [...project, ...args], options);
const psql = (service, sql, extra = []) =>
  docker(
    [
      "exec",
      "-T",
      service,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-U",
      "postgres",
      "-d",
      "nuno",
      ...extra,
    ],
    {
      input: sql,
    },
  );
const url = (user, service) => `postgres://${user}@localhost:${PORTS[service]}/nuno`;

/** 역할을 만들고 로컬 비밀번호를 넣는다. 개발 서버에서는 관리자가 setup.sql 만 돌리고 비밀번호는 따로 넣는다. */
function setupRoles(service) {
  psql(service, readFileSync(join(root, "apps/api/db/setup.sql"), "utf8"));
  psql(service, `ALTER ROLE nuno_api PASSWORD '${API_PASSWORD}';`);
}

function migrate(service) {
  run("node", ["apps/api/src/composition/run-migrations.ts"], {
    env: { ...process.env, DATABASE_ADMIN_URL: url(ADMIN, service) },
    stdio: "inherit",
  });
}

const maxVersion = (service) =>
  psql(service, "SELECT max(version) FROM schema_migrations;", ["-t", "-A"]).trim();

function dbTests(service) {
  run("pnpm", ["exec", "vitest", "run", "-c", "vitest.db.config.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_API_URL: url(`nuno_api:${API_PASSWORD}`, service),
      // 시험이 행 수를 세고, 스위치와 공급사 줄을 넣었다 되돌릴 때 쓰는 관리자 주소.
      TEST_DATABASE_ADMIN_URL: url(ADMIN, service),
    },
  });
}

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error("Docker 가 꺼져 있다. Docker 를 켠 뒤 다시 돌린다(DB 시험은 건너뛰지 않는다).");
  process.exit(1);
}

if (local) {
  docker(["up", "-d", "--wait", "postgres"]);
  setupRoles("postgres");
  migrate("postgres");
  console.log(`로컬 개발 DB: ${url("nuno_api:<로컬 비밀번호>", "postgres")}`);
  process.exit(0);
}

let failed = false;
try {
  docker(["down", "-v"]);
  docker(["up", "-d", "--wait", "test-a", "test-b"]);
  setupRoles("test-a");
  migrate("test-a");
  console.log("DB 시험 1/2: 판을 옮긴 test-a");
  dbTests("test-a");

  const dump = docker(["exec", "-T", "test-a", "pg_dump", "-U", "postgres", "-d", "nuno"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  setupRoles("test-b");
  psql("test-b", dump);
  const [from, to] = [maxVersion("test-a"), maxVersion("test-b")];
  if (from !== to) throw new Error(`복원한 판 번호가 다르다: test-a ${from}, test-b ${to}`);
  console.log(`DB 시험 2/2: 역할만 만든 test-b 에 test-a 덤프를 넣음(판 ${to}), 판 옮기기 없이`);
  dbTests("test-b");
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  spawnSync("docker", [...project, "down", "-v"], { cwd: root, stdio: "ignore" });
}
process.exit(failed ? 1 : 0);

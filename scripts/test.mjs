import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const envPath = resolve(process.env.TEST_ENV_FILE ?? ".env.test");
if (existsSync(envPath)) config({ path: envPath });

function databaseTarget(name, rawUrl) {
  if (!rawUrl) {
    console.error(`${name} must point to the isolated eevents_test database.`);
    process.exit(1);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    console.error(`${name} is not a valid database URL.`);
    process.exit(1);
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== "postgresql:" && url.protocol !== "postgres:"
  ) {
    console.error(`${name} must use PostgreSQL.`);
    process.exit(1);
  }
  if (
    databaseName !== "eevents_test" ||
    url.username !== "eevents" ||
    url.password !== "eevents_test_only" ||
    !["5432", "55433"].includes(url.port)
  ) {
    console.error(`${name} must target the dedicated local eevents_test database.`);
    process.exit(1);
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    console.error(`${name} must use a local test database host.`);
    process.exit(1);
  }

  return `${url.hostname}:${url.port}/${databaseName}`;
}

const runtimeTarget = databaseTarget("DATABASE_URL", process.env.DATABASE_URL);
const directTarget = databaseTarget("DIRECT_URL", process.env.DIRECT_URL);
if (runtimeTarget !== directTarget) {
  console.error("DATABASE_URL and DIRECT_URL must point to the same test database.");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
run("pnpm", ["exec", "vitest", "run"]);

import { expect, it } from "vitest";
import { runtimeDatabaseUrl } from "@/lib/database-url";

it("enables transaction-pooler compatibility while preserving credentials and existing options", () => {
  const source = "postgresql://postgres.project:encoded%40password@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require&connection_limit=3&pgbouncer=false";
  const result = new URL(runtimeDatabaseUrl(source)!);
  expect(result.searchParams.get("pgbouncer")).toBe("true");
  expect(result.searchParams.get("sslmode")).toBe("require");
  expect(result.searchParams.get("connection_limit")).toBe("3");
  expect(result.password).toBe("encoded%40password");
  expect(runtimeDatabaseUrl(result.toString())).toBe(result.toString());
});

it("leaves local, direct, session-pooler and other providers unchanged", () => {
  for (const source of [
    "postgresql://test:example@localhost:55433/eevents_test?schema=public",
    "postgresql://test:example@db.project.supabase.co:5432/postgres",
    "postgresql://test:example@aws-0-region.pooler.supabase.com:5432/postgres",
    "postgresql://test:example@other.example:6543/postgres",
  ]) expect(runtimeDatabaseUrl(source)).toBe(source);
  expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
});

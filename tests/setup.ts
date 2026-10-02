import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import "./support/next-mocks";
import { resetTestDatabase } from "./support/database";

process.env.CHECKIN_SIGNING_SECRET ??=
  "test-only-signing-secret-with-at-least-32-bytes";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

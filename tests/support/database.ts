import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { setTestCookieToken, setTestHeaders } from "./next-mocks";

export async function resetTestDatabase(): Promise<void> {
  await db.registration.deleteMany();
  await db.session.deleteMany();
  await db.eventHost.deleteMany();
  await db.event.deleteMany();
  await db.user.deleteMany();
  setTestCookieToken(null);
  setTestHeaders({});
}

export async function createTestUser(
  input: { name?: string; email?: string; role?: "PARTICIPANT" | "ADMIN" } = {},
) {
  const suffix = randomBytes(6).toString("hex");
  return db.user.create({
    data: {
      name: input.name ?? "Test Participant",
      email: input.email ?? `participant-${suffix}@example.test`,
      passwordHash: "$2b$12$Ll3Z0pbiaVqD2zRxhdM/C.QuVsuFDWAda0oVSHcR4K1VvrcP6.P8K",
      role: input.role ?? "PARTICIPANT",
    },
  });
}

export async function createTestSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  setTestCookieToken(token);
  return token;
}

export async function createTestEvent(
  organizerId: string,
  overrides: {
    title?: string;
    slug?: string;
    startsAt?: Date;
    endsAt?: Date;
    capacity?: number;
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
    location?: string | null;
    coverKey?: string | null;
    venueName?: string | null;
    venueAddress?: string | null;
    mapUrl?: string | null;
  } = {},
) {
  const suffix = randomBytes(6).toString("hex");
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  return db.event.create({
    data: {
      organizerId,
      title: overrides.title ?? "Test Event",
      slug: overrides.slug ?? `test-event-${suffix}`,
      description: "An event for an integration test.",
      ...(overrides.location !== undefined ? { location: overrides.location } : {}),
      ...(overrides.coverKey !== undefined ? { coverKey: overrides.coverKey } : {}),
      ...(overrides.venueName !== undefined ? { venueName: overrides.venueName } : {}),
      ...(overrides.venueAddress !== undefined
        ? { venueAddress: overrides.venueAddress }
        : {}),
      ...(overrides.mapUrl !== undefined ? { mapUrl: overrides.mapUrl } : {}),
      startsAt,
      endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: overrides.capacity ?? 10,
      status: overrides.status ?? "PUBLISHED",
    },
  });
}

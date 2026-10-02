import "server-only";

import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { LoginInput, SignupInput } from "@/lib/validation";

const BCRYPT_COST = 12;
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_EMAILS = 5_000;

// A valid cost-12 bcrypt hash keeps unknown-account checks on the same path.
const DUMMY_BCRYPT_HASH =
  "$2b$12$Ll3Z0pbiaVqD2zRxhdM/C.QuVsuFDWAda0oVSHcR4K1VvrcP6.P8K";

type LoginAttempt = {
  startedAt: number;
  count: number;
};

const failedLogins = new Map<string, LoginAttempt>();

type SignupResult = { kind: "created" } | { kind: "unavailable" };
type LoginResult =
  | { kind: "authenticated"; userId: string; role: Role }
  | { kind: "invalid" }
  | { kind: "rate-limited" }
  | { kind: "unavailable" };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function isRateLimited(email: string, now: number): boolean {
  const attempt = failedLogins.get(email);
  if (!attempt) return false;

  if (now - attempt.startedAt >= LOGIN_WINDOW_MS) {
    failedLogins.delete(email);
    return false;
  }

  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(email: string, now: number): void {
  const current = failedLogins.get(email);

  if (current && now - current.startedAt < LOGIN_WINDOW_MS) {
    current.count += 1;
    return;
  }

  if (failedLogins.size >= MAX_TRACKED_EMAILS) {
    for (const [key, attempt] of failedLogins) {
      if (now - attempt.startedAt >= LOGIN_WINDOW_MS) failedLogins.delete(key);
    }

    if (failedLogins.size >= MAX_TRACKED_EMAILS) {
      const oldestEmail = failedLogins.keys().next().value;
      if (oldestEmail) failedLogins.delete(oldestEmail);
    }
  }

  failedLogins.set(email, { startedAt: now, count: 1 });
}

export async function createParticipantAccount(
  input: SignupInput,
): Promise<SignupResult> {
  try {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "PARTICIPANT",
      },
      select: { id: true },
    });

    return { kind: "created" };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      console.error("Participant account creation failed.");
    }

    // Keep duplicate-email and infrastructure failures indistinguishable to callers.
    return { kind: "unavailable" };
  }
}

export async function authenticateUser(
  input: LoginInput,
): Promise<LoginResult> {
  const now = Date.now();
  if (isRateLimited(input.email, now)) return { kind: "rate-limited" };

  let user: { id: string; passwordHash: string; role: Role } | null;
  try {
    await db.session.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
    user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, role: true },
    });
  } catch {
    console.error("Account lookup failed during sign-in.");
    return { kind: "unavailable" };
  }

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
  } catch {
    // A corrupt stored hash still gets the normal dummy comparison before failure.
    if (user) {
      console.error("Stored password hash could not be verified.");
      await bcrypt.compare(input.password, DUMMY_BCRYPT_HASH);
    }
  }

  if (!user || !passwordMatches) {
    recordFailedLogin(input.email, now);
    return { kind: "invalid" };
  }

  failedLogins.delete(input.email);
  return { kind: "authenticated", userId: user.id, role: user.role };
}

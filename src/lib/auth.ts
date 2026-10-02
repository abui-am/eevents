import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { safeLoginReturnPath } from "@/lib/redirects";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-eevents_session"
    : "eevents_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

export type AuthenticatedUser = Prisma.UserGetPayload<{
  select: typeof USER_SELECT;
}>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSessionToken(token: string | undefined): token is string {
  return token !== undefined && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function getUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!isSessionToken(token)) return null;

  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      user: { select: USER_SELECT },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await db.session.deleteMany({ where: { tokenHash } });
    return null;
  }

  return session.user;
}

export async function requireUser(
  requestedEventPath?: unknown,
): Promise<AuthenticatedUser> {
  const user = await getUser();
  if (!user) {
    const returnPath = await safeLoginReturnPath(requestedEventPath);
    redirect(
      returnPath ? `/login?next=${encodeURIComponent(returnPath)}` : "/login",
    );
  }
  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const oldToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await db.$transaction(async (transaction) => {
    if (isSessionToken(oldToken)) {
      await transaction.session.deleteMany({
        where: { tokenHash: hashToken(oldToken) },
      });
    }

    await transaction.session.create({
      data: { userId, tokenHash, expiresAt },
    });
  });

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  try {
    if (isSessionToken(token)) {
      await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
  } catch {
    console.error("Session cleanup failed during sign-out.");
  } finally {
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
}

import "server-only";

import { db } from "@/lib/db";

const EVENT_PATH = /^\/events\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/apply)?$/;
const CHECK_IN_PATH =
  /^\/admin\/events\/([A-Za-z0-9_-]{1,180})\/check-in\?ticket=(v1\.[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9_-]{1,256}\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43})$/;

export function checkInReturnPath(
  eventId: unknown,
  ticketReference: unknown,
): string | null {
  if (
    typeof eventId !== "string" ||
    !/^[A-Za-z0-9_-]{1,180}$/.test(eventId) ||
    typeof ticketReference !== "string" ||
    ticketReference.length > 1_024
  ) {
    return null;
  }

  const path = `/admin/events/${eventId}/check-in?ticket=${ticketReference}`;
  return CHECK_IN_PATH.test(path) ? path : null;
}

/** Allow only known local event and signed-ticket destinations after login. */
export async function safeLoginReturnPath(
  candidate: unknown,
): Promise<string | null> {
  if (typeof candidate !== "string" || candidate.length > 1_600) return null;

  const checkInMatch = CHECK_IN_PATH.exec(candidate);
  if (checkInMatch) {
    return checkInReturnPath(checkInMatch[1], checkInMatch[2]);
  }

  if (candidate.length > 240) return null;

  const match = EVENT_PATH.exec(candidate);
  if (!match) return null;

  try {
    const event = await db.event.findUnique({
      where: { slug: match[1] },
      select: { status: true },
    });

    return event?.status === "PUBLISHED" ? `/events/${match[1]}${match[2] ?? ""}` : null;
  } catch {
    console.error("Could not validate the post-login event path.");
    return null;
  }
}

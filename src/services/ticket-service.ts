import "server-only";

import type { Role, RegistrationStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type TicketViewer = { id: string; role: Role };

export type TicketPresentation = {
  id: string;
  participantName: string;
  participantEmail: string;
  checkedInAt: Date | null;
  event: {
    id: string;
    title: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED" | "CANCELLED";
    startsAt: Date;
    endsAt: Date;
    location: string | null;
    place: string | null;
  };
  status: RegistrationStatus;
  ticketVersion: string | null;
  usable: boolean;
  unavailableReason:
    | "event-cancelled"
    | "event-unavailable"
    | "awaiting-confirmation"
    | "revoked";
  checkInOpen: boolean;
  phase: "arrival" | "final";
};

/** Returns null both for missing registrations and cross-account requests. */
export async function getTicketPresentation(
  registrationId: string,
  viewer: TicketViewer,
  now = new Date(),
): Promise<TicketPresentation | null> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      userId: true,
      status: true,
      checkInTicketVersion: true,
      checkedInAt: true,
      participant: { select: { name: true, email: true } },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          startsAt: true,
          endsAt: true,
          location: true,
          venueName: true,
        },
      },
    },
  });

  if (
    !registration ||
    (registration.userId !== viewer.id && viewer.role !== "ADMIN")
  ) {
    return null;
  }

  const hasConfirmedStatus =
    registration.status === "REGISTERED" || registration.status === "CONFIRMED" || registration.status === "ATTENDED";
  const usable =
    hasConfirmedStatus &&
    registration.checkInTicketVersion !== null &&
    registration.event.status === "PUBLISHED";

  let unavailableReason: TicketPresentation["unavailableReason"] = "revoked";
  if (registration.event.status === "CANCELLED") {
    unavailableReason = "event-cancelled";
  } else if (registration.event.status !== "PUBLISHED") {
    unavailableReason = "event-unavailable";
  } else if (registration.status === "REGISTERED") {
    unavailableReason = "revoked";
  }

  return {
    id: registration.id,
    participantName: registration.participant.name,
    participantEmail: registration.participant.email,
    checkedInAt: registration.checkedInAt,
    event: {
      id: registration.event.id,
      title: registration.event.title,
      slug: registration.event.slug,
      status: registration.event.status,
      startsAt: registration.event.startsAt,
      endsAt: registration.event.endsAt,
      location: registration.event.location,
      place: registration.event.venueName ?? registration.event.location,
    },
    status: registration.status,
    ticketVersion: registration.checkInTicketVersion,
    usable,
    unavailableReason,
    checkInOpen: usable,
    phase: registration.checkedInAt && now >= registration.event.endsAt ? "final" : "arrival",
  };
}

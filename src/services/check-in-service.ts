import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type RegistrationStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyTicketReference } from "@/lib/check-in-tickets";
import { certificatePath, renderCertificate } from "@/lib/html-certificate";

const idSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/);
const ticketSchema = z.string().min(1).max(1_024);
const eligibleStatuses: RegistrationStatus[] = ["REGISTERED", "CONFIRMED", "ATTENDED"];

export const CHECK_IN_ERROR_MESSAGES = {
  invalid_input: "Check the ticket and try again.",
  invalid_ticket: "This ticket is no longer valid.",
  event_closed: "Scanning is unavailable because this event is not open.",
  check_in_closed: "Arrival scanning is available at any time. Certificate verification is available after the event ends.",
  missing_arrival: "Record an arrival before requesting certificate verification.",
  final_scan_required: "Use the participant’s QR to verify onsite presence after the event ends.",
  registration_ineligible: "This registration is not eligible for check-in.",
  undo_unavailable: "Recorded attendance cannot be undone.",
  unauthorized: "Only an administrator can record onsite scans.",
  concurrent_change: "The registration changed while you were scanning. Please try again.",
  unavailable: "We could not record this scan right now. Please try again.",
} as const;
export type CheckInErrorCode = keyof typeof CHECK_IN_ERROR_MESSAGES;
export class CheckInError extends Error {
  constructor(readonly code: CheckInErrorCode) { super(code); this.name = "CheckInError"; }
}
export type CheckInUnavailableReason = "event-cancelled" | "event-unavailable";
export type CheckInReview = {
  eventId: string; eventSlug: string; eventTitle: string;
  eventStatus: "DRAFT" | "PUBLISHED" | "CANCELLED";
  startsAt: Date; endsAt: Date; participantName: string; participantEmail: string;
  registrationId: string; registrationStatus: RegistrationStatus;
  checkedInAt: Date | null; checkedInByName: string | null;
  endPresenceAt: Date | null; certificateHref: string | null;
  certificateKey: string | null; certificateUploadedAt: Date | null;
  canCheckIn: boolean; canUndo: boolean; phase: "arrival" | "final";
  unavailableReason: CheckInUnavailableReason | null;
};
export type CheckInResult = {
  eventId: string; eventSlug: string; registrationId: string;
  checkedInAt: Date; checkedInById: string; alreadyCheckedIn: boolean;
  outcome: "arrived" | "already-arrived" | "certified" | "already-certified";
  certificateHref: string | null;
};

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (!isSerializationConflict(error)) throw error;
    }
  }
  throw new CheckInError("concurrent_change");
}
function toCheckInError(error: unknown): never {
  if (error instanceof CheckInError) throw error;
  if (isSerializationConflict(error)) throw new CheckInError("concurrent_change");
  console.error("Administrator onsite scan failed.");
  throw new CheckInError("unavailable");
}
function unavailableReason(registration: {
  checkedInAt: Date | null;
  event: { status: "DRAFT" | "PUBLISHED" | "CANCELLED"; startsAt: Date; endsAt: Date };
}): CheckInUnavailableReason | null {
  const { event } = registration;
  if (event.status === "CANCELLED") return "event-cancelled";
  if (event.status !== "PUBLISHED") return "event-unavailable";
  return null;
}

/** Read-only; the authorized browser submits a separate POST action. */
export async function getCheckInReview(eventId: string, rawTicketReference: unknown, now = new Date()): Promise<CheckInReview | null> {
  const parsedEventId = idSchema.safeParse(eventId);
  const payload = verifyTicketReference(rawTicketReference);
  if (!parsedEventId.success || !payload || payload.eventId !== parsedEventId.data) return null;
  const registration = await db.registration.findFirst({
    where: { id: payload.registrationId, eventId: parsedEventId.data, checkInTicketVersion: payload.ticketVersion, status: { in: eligibleStatuses } },
    select: {
      id: true, status: true, checkedInAt: true, endPresenceAt: true,
      certificateKey: true, certificateUploadedAt: true, certificate: { select: { token: true } },
      checkedInBy: { select: { name: true } }, participant: { select: { name: true, email: true } },
      event: { select: { id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true } },
    },
  });
  if (!registration) return null;
  const reason = unavailableReason(registration);
  return {
    eventId: registration.event.id, eventSlug: registration.event.slug, eventTitle: registration.event.title,
    eventStatus: registration.event.status, startsAt: registration.event.startsAt, endsAt: registration.event.endsAt,
    participantName: registration.participant.name, participantEmail: registration.participant.email,
    registrationId: registration.id, registrationStatus: registration.status,
    checkedInAt: registration.checkedInAt, checkedInByName: registration.checkedInBy?.name ?? null,
    endPresenceAt: registration.endPresenceAt,
    certificateHref: registration.certificate ? certificatePath(registration.certificate.token) : null,
    certificateKey: registration.certificateKey, certificateUploadedAt: registration.certificateUploadedAt,
    canCheckIn: reason === null, canUndo: false,
    phase: registration.checkedInAt && now >= registration.event.endsAt ? "final" : "arrival", unavailableReason: reason,
  };
}

async function confirmTicket(adminId: string, eventId: string, payload: { registrationId: string; ticketVersion: string }, now: Date, manual = false): Promise<CheckInResult> {
  try {
    return await withSerializableRetry(() => db.$transaction(async (transaction) => {
      const admin = await transaction.user.findFirst({ where: { id: adminId, role: "ADMIN" }, select: { id: true } });
      if (!admin) throw new CheckInError("unauthorized");
      const registration = await transaction.registration.findFirst({
        where: { id: payload.registrationId, eventId, checkInTicketVersion: payload.ticketVersion },
        select: {
          id: true, status: true, checkedInAt: true, checkedInById: true,
          certificate: { select: { token: true } }, participant: { select: { name: true } },
          event: { select: { id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true, organizer: { select: { name: true } } } },
        },
      });
      if (!registration || !eligibleStatuses.includes(registration.status)) throw new CheckInError("invalid_ticket");
      const reason = unavailableReason(registration);
      if (reason === "event-cancelled" || reason === "event-unavailable") throw new CheckInError("event_closed");
      const finalScan = registration.checkedInAt !== null && now >= registration.event.endsAt;
      if (finalScan && manual) throw new CheckInError("final_scan_required");
      const base = {
        eventId: registration.event.id, eventSlug: registration.event.slug, registrationId: registration.id,
        checkedInAt: registration.checkedInAt ?? now, checkedInById: registration.checkedInById ?? adminId,
        alreadyCheckedIn: registration.checkedInAt !== null,
        certificateHref: registration.certificate ? certificatePath(registration.certificate.token) : null,
      };
      if (finalScan) {
        if (registration.certificate) return { ...base, outcome: "already-certified" };
        const token = randomBytes(32).toString("base64url");
        const id = randomUUID();
        const html = renderCertificate({
          id, participantName: registration.participant.name, eventTitle: registration.event.title,
          organizerName: registration.event.organizer.name, startsAt: registration.event.startsAt,
          endsAt: registration.event.endsAt, issuedAt: now,
        });
        await transaction.registration.update({
          where: { id: registration.id }, data: {
            status: "ATTENDED", endPresenceAt: now, endPresenceById: adminId,
            certificate: { create: { id, token, html, templateVersion: 1, issuedAt: now } },
          },
        });
        return { ...base, outcome: "certified", certificateHref: certificatePath(token) };
      }
      // Also reconcile a legacy arrival whose old workflow left it CONFIRMED.
      await transaction.registration.update({
        where: { id: registration.id }, data: {
          status: "ATTENDED", checkedInAt: base.checkedInAt, checkedInById: base.checkedInById,
        },
      });
      return { ...base, outcome: registration.checkedInAt ? "already-arrived" : "arrived" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) { toCheckInError(error); }
}

export async function confirmQrCheckIn(adminId: string, eventId: string, rawTicketReference: unknown, now = new Date()): Promise<CheckInResult> {
  const parsedAdmin = idSchema.safeParse(adminId);
  const parsedEvent = idSchema.safeParse(eventId);
  const ticket = ticketSchema.safeParse(rawTicketReference);
  const payload = ticket.success ? verifyTicketReference(ticket.data) : null;
  if (!parsedAdmin.success || !parsedEvent.success || !payload || payload.eventId !== parsedEvent.data) throw new CheckInError("invalid_ticket");
  return confirmTicket(parsedAdmin.data, parsedEvent.data, payload, now);
}

export async function manuallyCheckIn(adminId: string, eventId: string, registrationId: string, now = new Date()): Promise<CheckInResult> {
  if (![adminId, eventId, registrationId].every((id) => idSchema.safeParse(id).success)) throw new CheckInError("invalid_input");
  const registration = await db.registration.findFirst({
    where: { id: registrationId, eventId, status: { in: eligibleStatuses }, checkInTicketVersion: { not: null } },
    select: { checkInTicketVersion: true },
  });
  if (!registration?.checkInTicketVersion) throw new CheckInError("registration_ineligible");
  return confirmTicket(adminId, eventId, { registrationId, ticketVersion: registration.checkInTicketVersion }, now, true);
}

/** Old callers cannot bypass the terminal attendance rule. */
export async function undoCheckIn(_adminId: string, _eventId: string, _registrationId: string, _now = new Date()): Promise<{ eventId: string; eventSlug: string; registrationId: string; undone: boolean }> {
  void _now;
  throw new CheckInError("undo_unavailable");
}

import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { createEventInputSchema, eventInputSchema } from "@/lib/validation";
import type { ScheduleReference } from "@/lib/zoned-schedule";
import type { AnswerFilter } from "@/lib/questionnaire";
import { answerFilterWhere, getFilterQuestions } from "./questionnaire-service";

export const ADMIN_PAGE_SIZE = 20;

export const ADMIN_ERROR_MESSAGES = {
  invalid_input: "Check the event details and try again.",
  invalid_schedule: "End time must be later than start time.",
  invalid_time_zone: "Choose a valid timezone for the event schedule.",
  invalid_local_time: "A schedule time is skipped or repeated when clocks change. Choose another time, or enter the intended time in UTC.",
  unavailable: "We could not save this event right now. Please try again.",
  event_not_found: "That event could not be found.",
  registrations_exist: "This event has registrations, so it cannot return to draft.",
  capacity_too_low: "Capacity cannot be lower than the number of active registrations.",
  schedule_locked: "The event schedule cannot be changed after the event has started.",
  event_cancelled: "A cancelled event cannot be reopened.",
  invalid_transition: "That participant status change is not allowed.",
  event_closed: "This event is not open for that status change.",
  event_not_started: "Attendance can only be recorded from the event start time.",
  event_not_ended: "A no-show can only be recorded after the event ends.",
  already_checked_in: "A checked-in participant cannot be marked as a no-show.",
  capacity_full: "The event is full and this registration cannot be reopened.",
  concurrent_change: "The event changed while you were saving. Reload and try again.",
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERROR_MESSAGES;

export class AdminEventError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = "AdminEventError";
  }
}

export type AdminEventInput = z.infer<typeof eventInputSchema>;

function eventWriteData(input: AdminEventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    status: input.status,
    ...(input.venueName !== undefined ? { venueName: input.venueName } : {}),
    ...(input.venueAddress !== undefined ? { venueAddress: input.venueAddress } : {}),
    ...(input.mapUrl !== undefined ? { mapUrl: input.mapUrl } : {}),
  };
}

const registrationStatusValues = [
  "REGISTERED",
  "CONFIRMED",
  "ATTENDED",
  "NO_SHOW",
  "CANCELLED",
] as const satisfies readonly RegistrationStatus[];
const statusInputSchema = z.object({
  eventId: z.string().trim().min(1).max(64),
  registrationId: z.string().trim().min(1).max(64),
  nextStatus: z.enum(registrationStatusValues),
});

export type AdminRegistrationStatusInput = z.infer<typeof statusInputSchema>;
export type ArrivalFilter = "checked-in" | "not-checked-in";

function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");

  return `${base || "event"}-${randomUUID().slice(0, 8)}`;
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
  );
}

function toAdminError(error: unknown): never {
  if (error instanceof AdminEventError) throw error;
  if (isSerializationConflict(error)) throw new AdminEventError("concurrent_change");
  console.error("Administrator event operation failed.");
  throw new AdminEventError("unavailable");
}

export async function listAdminEvents(pageNumber: number) {
  const total = await db.event.count();
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, pageNumber), pageCount);
  const events = await db.event.findMany({
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      slug: true,
      coverKey: true,
      status: true,
      startsAt: true,
      endsAt: true,
      location: true,
      capacity: true,
    },
  });

  if (events.length === 0) return { events: [], page, pageCount, total };

  const counts = await db.registration.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: events.map((event) => event.id) },
      status: { not: "CANCELLED" },
    },
    _count: { _all: true },
  });
  const registrationsByEvent = new Map(
    counts.map((row) => [row.eventId, row._count._all]),
  );

  return {
    events: events.map((event) => ({
      ...event,
      registrationCount: registrationsByEvent.get(event.id) ?? 0,
    })),
    page,
    pageCount,
    total,
  };
}

export async function getAdminEvent(eventId: string) {
  return db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      location: true,
      coverKey: true,
      venueName: true,
      venueAddress: true,
      mapUrl: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      hosts: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          biography: true,
          publicEmail: true,
          avatarKey: true,
          displayOrder: true,
        },
      },
    },
  });
}

export async function saveAdminEvent(
  adminId: string,
  eventId: string | null,
  rawInput: unknown,
) {
  function parseInput(reference?: ScheduleReference) {
    const parsed = createEventInputSchema(reference).safeParse(rawInput);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === "timeZone")) throw new AdminEventError("invalid_time_zone");
      if (parsed.error.issues.some((issue) => issue.message.startsWith("This time is skipped"))) throw new AdminEventError("invalid_local_time");
      const invalidSchedule = parsed.error.issues.some((issue) => issue.message === "End time must be later than start time.");
      throw new AdminEventError(invalidSchedule ? "invalid_schedule" : "invalid_input");
    }
    return parsed.data;
  }
  const creationInput = eventId ? null : parseInput();
  if (creationInput?.status === "CANCELLED") {
    throw new AdminEventError("invalid_input");
  }

  try {
    return await db.$transaction(
      async (transaction) => {
        if (!eventId && creationInput) {
          return transaction.event.create({
            data: {
              ...eventWriteData(creationInput),
              organizerId: adminId,
              slug: slugify(creationInput.title),
            },
            select: { id: true, slug: true },
          });
        }

        if (!eventId) throw new AdminEventError("invalid_input");
        const current = await transaction.event.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        });
        if (!current) throw new AdminEventError("event_not_found");
        const input = parseInput({ startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString() });

        const registrationCount = await transaction.registration.count({
          where: { eventId, status: { not: "CANCELLED" } },
        });
        const anyRegistrationCount = await transaction.registration.count({
          where: { eventId },
        });

        if (input.capacity < registrationCount) {
          throw new AdminEventError("capacity_too_low");
        }

        if (current.status === "CANCELLED" && input.status !== "CANCELLED") {
          throw new AdminEventError("event_cancelled");
        }

        if (
          input.status === "DRAFT" &&
          current.status !== "DRAFT" &&
          anyRegistrationCount > 0
        ) {
          throw new AdminEventError("registrations_exist");
        }

        if (
          current.startsAt <= new Date() &&
          (input.startsAt.getTime() !== current.startsAt.getTime() ||
            input.endsAt.getTime() !== current.endsAt.getTime())
        ) {
          throw new AdminEventError("schedule_locked");
        }

        return transaction.event.update({
          where: { id: eventId },
          data: eventWriteData(input),
          select: { id: true, slug: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    toAdminError(error);
  }
}

export async function getAdminEventParticipants(
  eventId: string,
  options: {
    page: number;
    status?: RegistrationStatus;
    arrival?: ArrivalFilter;
    query?: string;
    answerFilters?: AnswerFilter[];
  },
) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      coverKey: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      updatedAt: true,
      hosts: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          avatarKey: true,
        },
      },
    },
  });
  if (!event) return null;

  const filterQuestions = await getFilterQuestions(eventId);
  const query = options.query?.trim().slice(0, 100) ?? "";
  const baseWhere: Prisma.RegistrationWhereInput = {
    eventId,
    AND: answerFilterWhere(options.answerFilters ?? [], filterQuestions),
    ...(options.arrival === "checked-in"
      ? { checkedInAt: { not: null } }
      : options.arrival === "not-checked-in"
        ? { checkedInAt: null }
        : {}),
    ...(query
      ? {
          participant: {
            is: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            },
          },
        }
      : {}),
  };

  const counts = await db.registration.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } });
  const statusCounts = Object.fromEntries(registrationStatusValues.map((status) => [status, 0])) as Record<RegistrationStatus, number>;
  for (const row of counts) statusCounts[row.status] = row._count._all;
  const activeRegistrationCount = await db.registration.count({ where: { eventId, status: { not: "CANCELLED" } } });
  const where: Prisma.RegistrationWhereInput = { ...baseWhere, ...(options.status ? { status: options.status } : {}) };
  const total = await db.registration.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page), pageCount);
  const registrations = await db.registration.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      cancelledBy: true,
      checkedInAt: true,
      certificateKey: true,
      certificateUploadedAt: true,
      certificate: { select: { token: true } },
      endPresenceAt: true,
      createdAt: true,
      participant: { select: { name: true, email: true } },
    },
  });

  return {
    event,
    registrations,
    statusCounts,
    page,
    pageCount,
    total,
    query,
    arrival: options.arrival,
    filterQuestions,
    activeRegistrationCount,
  };
}

const ALLOWED_TRANSITIONS: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  REGISTERED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ATTENDED", "NO_SHOW", "CANCELLED"],
  ATTENDED: [],
  NO_SHOW: [],
  CANCELLED: ["REGISTERED"],
};

export async function setAdminRegistrationStatus(
  rawInput: unknown,
): Promise<{ eventId: string; eventSlug: string; status: RegistrationStatus }> {
  const parsed = statusInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new AdminEventError("invalid_input");

  const { eventId, registrationId, nextStatus } = parsed.data;
  try {
    const result = await db.$transaction(
      async (transaction) => {
        const registration = await transaction.registration.findFirst({
          where: { id: registrationId, eventId },
          select: {
            id: true,
            status: true,
            cancelledBy: true,
            checkedInAt: true,
            checkInTicketVersion: true,
            event: {
              select: {
                id: true,
                slug: true,
                status: true,
                startsAt: true,
                endsAt: true,
                capacity: true,
              },
            },
          },
        });
        if (!registration) throw new AdminEventError("event_not_found");

        if (registration.status === nextStatus) {
          return {
            eventId: registration.event.id,
            eventSlug: registration.event.slug,
            status: registration.status,
          };
        }

        if (!ALLOWED_TRANSITIONS[registration.status].includes(nextStatus)) {
          throw new AdminEventError("invalid_transition");
        }

        const now = new Date();
        if (registration.event.status !== "PUBLISHED") {
          throw new AdminEventError("event_closed");
        }

        if (nextStatus === "CONFIRMED" || nextStatus === "CANCELLED") {
          if (registration.event.startsAt <= now) {
            throw new AdminEventError("event_closed");
          }
        }

        if (nextStatus === "ATTENDED" && now < registration.event.startsAt) {
          throw new AdminEventError("event_not_started");
        }

        if (nextStatus === "NO_SHOW" && now < registration.event.endsAt) {
          throw new AdminEventError("event_not_ended");
        }
        if (nextStatus === "NO_SHOW" && registration.checkedInAt) {
          throw new AdminEventError("already_checked_in");
        }

        if (nextStatus === "REGISTERED") {
          if (registration.cancelledBy !== "ADMIN") {
            throw new AdminEventError("invalid_transition");
          }
          if (registration.event.startsAt <= now) {
            throw new AdminEventError("event_closed");
          }
          const activeRegistrationCount = await transaction.registration.count({
            where: {
              eventId,
              status: { not: "CANCELLED" },
            },
          });
          if (activeRegistrationCount >= registration.event.capacity) {
            throw new AdminEventError("capacity_full");
          }
        }

        const updateData: Prisma.RegistrationUncheckedUpdateInput = {
          status: nextStatus,
          ...(nextStatus === "CONFIRMED"
            ? {
                checkInTicketVersion: registration.checkInTicketVersion ?? randomUUID(),
                cancelledBy: null,
              }
            : {}),
          ...(nextStatus === "CANCELLED"
            ? {
                cancelledBy: "ADMIN",
                checkInTicketVersion: null,
                checkedInAt: null,
                checkedInById: null,
              }
            : {}),
          ...(nextStatus === "REGISTERED"
            ? {
                cancelledBy: null,
                checkInTicketVersion: randomUUID(),
                checkedInAt: null,
                checkedInById: null,
              }
            : {}),
        };
        await transaction.registration.update({
          where: { id: registration.id },
          data: updateData,
        });

        return {
          eventId: registration.event.id,
          eventSlug: registration.event.slug,
          status: nextStatus,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return result;
  } catch (error) {
    toAdminError(error);
  }
}

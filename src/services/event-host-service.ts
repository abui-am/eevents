import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EVENT_CONTENT_LIMITS, hostInputSchema } from "@/lib/validation";

// Administrator checks stay in the action, matching saveAdminEvent.
// Every change here is scoped to the event id and, for an existing row, the host id.

export const EVENT_HOST_ERROR_MESSAGES = {
  invalid_input: "Check the host details and try again.",
  event_not_found: "That event could not be found.",
  host_not_found: "That host could not be found for this event.",
  host_limit: "An event can have at most 10 hosts.",
  concurrent_change: "The hosts changed while you were saving. Reload and try again.",
  unavailable: "We could not save this host right now. Please try again.",
} as const;

export type EventHostErrorCode = keyof typeof EVENT_HOST_ERROR_MESSAGES;

export class EventHostError extends Error {
  constructor(readonly code: EventHostErrorCode) {
    super(code);
    this.name = "EventHostError";
  }
}

const hostSelect = {
  id: true,
  eventId: true,
  name: true,
  biography: true,
  publicEmail: true,
  avatarKey: true,
  displayOrder: true,
} satisfies Prisma.EventHostSelect;

export type EventHostRecord = Prisma.EventHostGetPayload<{ select: typeof hostSelect }>;

const TEMPORARY_ORDER_BASE = -1_000;

type HostTransaction = Prisma.TransactionClient;

function toEventHostError(error: unknown): never {
  if (error instanceof EventHostError) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  ) {
    throw new EventHostError("concurrent_change");
  }
  console.error("Event host operation failed.");
  throw new EventHostError("unavailable");
}

async function lockEvent(transaction: HostTransaction, eventId: string): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE
  `;
  if (rows.length !== 1) throw new EventHostError("event_not_found");
}

async function readHosts(
  transaction: HostTransaction,
  eventId: string,
): Promise<EventHostRecord[]> {
  return transaction.eventHost.findMany({
    where: { eventId },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: hostSelect,
  });
}

/**
 * Pack displayOrder to 0..n-1. Rows are parked on unique negative positions
 * first so the (eventId, displayOrder) pair cannot collide.
 */
async function rewriteDisplayOrder(
  transaction: HostTransaction,
  orderedHostIds: readonly string[],
): Promise<void> {
  for (let index = 0; index < orderedHostIds.length; index += 1) {
    const id = orderedHostIds[index];
    if (!id) throw new EventHostError("unavailable");
    await transaction.eventHost.update({
      where: { id },
      data: { displayOrder: -(index + 1) },
    });
  }

  for (let index = 0; index < orderedHostIds.length; index += 1) {
    const id = orderedHostIds[index];
    if (!id) throw new EventHostError("unavailable");
    await transaction.eventHost.update({
      where: { id },
      data: { displayOrder: index },
    });
  }
}

async function withHostTransaction<T>(operation: (transaction: HostTransaction) => Promise<T>) {
  try {
    return await db.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    toEventHostError(error);
  }
}

export async function createEventHost(eventId: string, rawInput: unknown) {
  const parsed = hostInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new EventHostError("invalid_input");

  return withHostTransaction(async (transaction) => {
    await lockEvent(transaction, eventId);
    const existing = await transaction.eventHost.findMany({
      where: { eventId },
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    });
    if (existing.length >= EVENT_CONTENT_LIMITS.maxHosts) {
      throw new EventHostError("host_limit");
    }

    const created = await transaction.eventHost.create({
      data: {
        eventId,
        name: parsed.data.name,
        biography: parsed.data.biography,
        publicEmail: parsed.data.publicEmail,
        avatarKey: parsed.data.avatarKey ?? null,
        displayOrder: TEMPORARY_ORDER_BASE - existing.length,
      },
      select: { id: true },
    });
    await rewriteDisplayOrder(transaction, [
      ...existing.map((host) => host.id),
      created.id,
    ]);

    return {
      hostId: created.id,
      hosts: await readHosts(transaction, eventId),
    };
  });
}

export async function updateEventHost(
  eventId: string,
  hostId: string,
  rawInput: unknown,
) {
  const parsed = hostInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new EventHostError("invalid_input");

  return withHostTransaction(async (transaction) => {
    await lockEvent(transaction, eventId);
    const updated = await transaction.eventHost.updateMany({
      where: { id: hostId, eventId },
      data: {
        name: parsed.data.name,
        biography: parsed.data.biography,
        publicEmail: parsed.data.publicEmail,
        ...(parsed.data.avatarKey !== undefined ? { avatarKey: parsed.data.avatarKey } : {}),
      },
    });
    if (updated.count !== 1) throw new EventHostError("host_not_found");

    const hosts = await readHosts(transaction, eventId);
    const host = hosts.find((item) => item.id === hostId);
    if (!host) throw new EventHostError("host_not_found");
    return { host, hosts };
  });
}

async function moveEventHost(eventId: string, hostId: string, direction: -1 | 1) {
  return withHostTransaction(async (transaction) => {
    await lockEvent(transaction, eventId);
    const hosts = await readHosts(transaction, eventId);
    const ids = hosts.map((host) => host.id);
    const index = ids.indexOf(hostId);
    if (index < 0) throw new EventHostError("host_not_found");

    const neighbor = index + direction;
    if (neighbor >= 0 && neighbor < ids.length) {
      const current = ids[index];
      const adjacent = ids[neighbor];
      if (current === undefined || adjacent === undefined) {
        throw new EventHostError("host_not_found");
      }
      ids[index] = adjacent;
      ids[neighbor] = current;
    }

    await rewriteDisplayOrder(transaction, ids);
    return { hosts: await readHosts(transaction, eventId) };
  });
}

export function moveEventHostUp(eventId: string, hostId: string) {
  return moveEventHost(eventId, hostId, -1);
}

export function moveEventHostDown(eventId: string, hostId: string) {
  return moveEventHost(eventId, hostId, 1);
}

/** Returns the removed avatar key so later image cleanup can target that object only. */
export async function removeEventHost(eventId: string, hostId: string) {
  return withHostTransaction(async (transaction) => {
    await lockEvent(transaction, eventId);
    const hosts = await readHosts(transaction, eventId);
    const removed = hosts.find((host) => host.id === hostId);
    if (!removed) throw new EventHostError("host_not_found");

    await transaction.eventHost.delete({ where: { id: removed.id } });
    await rewriteDisplayOrder(
      transaction,
      hosts.filter((host) => host.id !== removed.id).map((host) => host.id),
    );

    return {
      removedAvatarKey: removed.avatarKey,
      hosts: await readHosts(transaction, eventId),
    };
  });
}

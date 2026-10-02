import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { EventMediaError } from "@/lib/event-media-error";
import {
  collectReferencedKeys,
  isDeletableObjectKey,
  isNewEventMediaObjectKey,
} from "@/lib/event-media-contract";
import {
  deleteEventMediaObject,
  uploadEventMediaObject,
} from "@/lib/event-media-storage";
import {
  assertImageInputSize,
  normalizeEventImage,
  type EventImageVariant,
} from "@/services/image-processing";

const PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export interface EventMediaChange {
  eventId: string;
  slug: string;
  objectKey: string | null;
  cleanupFailed: boolean;
}

export function parseExpectedObjectKey(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed !== value || !isDeletableObjectKey(trimmed)) {
    throw new EventMediaError("invalid_input");
  }
  return trimmed;
}

function assertPathSegment(value: string): void {
  if (!PATH_SEGMENT.test(value)) throw new EventMediaError("invalid_input");
}

export function coverObjectKey(eventId: string): string {
  assertPathSegment(eventId);
  const objectKey = `covers/${eventId}/${randomUUID()}.webp`;
  if (!isNewEventMediaObjectKey(objectKey)) throw new EventMediaError("unavailable");
  return objectKey;
}

export function avatarObjectKey(eventId: string, hostId: string): string {
  assertPathSegment(eventId);
  assertPathSegment(hostId);
  const objectKey = `avatars/${eventId}/${hostId}/${randomUUID()}.webp`;
  if (!isNewEventMediaObjectKey(objectKey)) throw new EventMediaError("unavailable");
  return objectKey;
}

export async function loadReferencedEventMediaKeys(): Promise<Set<string>> {
  const [events, hosts] = await Promise.all([
    db.event.findMany({
      where: { coverKey: { not: null } },
      select: { coverKey: true },
    }),
    db.eventHost.findMany({
      where: { avatarKey: { not: null } },
      select: { avatarKey: true },
    }),
  ]);
  return collectReferencedKeys(
    events.map((event) => event.coverKey),
    hosts.map((host) => host.avatarKey),
  );
}

async function requireEvent(eventId: string) {
  assertPathSegment(eventId);
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, coverKey: true },
  });
  if (!event) throw new EventMediaError("event_not_found");
  return event;
}

async function requireHost(eventId: string, hostId: string) {
  assertPathSegment(eventId);
  assertPathSegment(hostId);
  const event = await requireEvent(eventId);
  const host = await db.eventHost.findFirst({
    where: { id: hostId, eventId },
    select: { id: true, avatarKey: true },
  });
  if (!host) throw new EventMediaError("host_not_found");
  return { event, host };
}

async function discardUnreferencedUpload(objectKey: string): Promise<void> {
  try {
    const referenced = await loadReferencedEventMediaKeys();
    if (referenced.has(objectKey)) {
      console.error("Event media refused to delete an object that is still referenced.");
      return;
    }
    await deleteEventMediaObject(objectKey);
  } catch (error) {
    if (error instanceof EventMediaError && error.code !== "cleanup_failed") throw error;
    console.error("Event media could not remove an unreferenced upload.", { objectKey });
  }
}

/** Returns true when the previous object could not be deleted. The new reference stays. */
async function deletePreviousObject(objectKey: string | null): Promise<boolean> {
  if (!objectKey) return false;
  try {
    const referenced = await loadReferencedEventMediaKeys();
    if (referenced.has(objectKey)) {
      console.error("Event media kept a previous object because it is still referenced.");
      return false;
    }
    await deleteEventMediaObject(objectKey);
    return false;
  } catch {
    console.error("Event media cleanup failed after the reference was updated.", {
      objectKey,
    });
    return true;
  }
}

async function storeProcessedImage(
  bytes: Buffer,
  variant: EventImageVariant,
  objectKey: string,
): Promise<void> {
  const processed = await normalizeEventImage(bytes, variant);
  try {
    await uploadEventMediaObject(objectKey, processed);
  } catch (error) {
    if (error instanceof EventMediaError) throw error;
    console.error("Event media upload failed.");
    throw new EventMediaError("storage_unavailable");
  }
}

export async function replaceEventCover(
  eventId: string,
  expectedKey: string | null,
  bytes: Buffer,
): Promise<EventMediaChange> {
  assertImageInputSize(bytes.byteLength);
  const event = await requireEvent(eventId);
  if (event.coverKey !== expectedKey) throw new EventMediaError("conflict");

  const objectKey = coverObjectKey(eventId);
  await storeProcessedImage(bytes, "cover", objectKey);

  let swapped = false;
  try {
    const updated = await db.event.updateMany({
      where: { id: eventId, coverKey: expectedKey },
      data: { coverKey: objectKey },
    });
    swapped = updated.count === 1;
  } catch {
    await discardUnreferencedUpload(objectKey);
    console.error("Event media reference update failed.");
    throw new EventMediaError("unavailable");
  }

  if (!swapped) {
    await discardUnreferencedUpload(objectKey);
    throw new EventMediaError("conflict");
  }

  return {
    eventId,
    slug: event.slug,
    objectKey,
    cleanupFailed: await deletePreviousObject(expectedKey),
  };
}

export async function clearEventCover(
  eventId: string,
  expectedKey: string | null,
): Promise<EventMediaChange> {
  const event = await requireEvent(eventId);
  if (event.coverKey !== expectedKey) throw new EventMediaError("conflict");

  let cleared = false;
  try {
    const updated = await db.event.updateMany({
      where: { id: eventId, coverKey: expectedKey },
      data: { coverKey: null },
    });
    cleared = updated.count === 1;
  } catch {
    console.error("Event media reference update failed.");
    throw new EventMediaError("unavailable");
  }
  if (!cleared) throw new EventMediaError("conflict");

  return {
    eventId,
    slug: event.slug,
    objectKey: null,
    cleanupFailed: await deletePreviousObject(expectedKey),
  };
}

export async function replaceHostAvatar(
  eventId: string,
  hostId: string,
  expectedKey: string | null,
  bytes: Buffer,
): Promise<EventMediaChange> {
  assertImageInputSize(bytes.byteLength);
  const { event, host } = await requireHost(eventId, hostId);
  if (host.avatarKey !== expectedKey) throw new EventMediaError("conflict");

  const objectKey = avatarObjectKey(eventId, hostId);
  await storeProcessedImage(bytes, "avatar", objectKey);

  let swapped = false;
  try {
    const updated = await db.eventHost.updateMany({
      where: { id: hostId, eventId, avatarKey: expectedKey },
      data: { avatarKey: objectKey },
    });
    swapped = updated.count === 1;
  } catch {
    await discardUnreferencedUpload(objectKey);
    console.error("Event media reference update failed.");
    throw new EventMediaError("unavailable");
  }

  if (!swapped) {
    await discardUnreferencedUpload(objectKey);
    throw new EventMediaError("conflict");
  }

  return {
    eventId,
    slug: event.slug,
    objectKey,
    cleanupFailed: await deletePreviousObject(expectedKey),
  };
}

export async function clearHostAvatar(
  eventId: string,
  hostId: string,
  expectedKey: string | null,
): Promise<EventMediaChange> {
  const { event, host } = await requireHost(eventId, hostId);
  if (host.avatarKey !== expectedKey) throw new EventMediaError("conflict");

  let cleared = false;
  try {
    const updated = await db.eventHost.updateMany({
      where: { id: hostId, eventId, avatarKey: expectedKey },
      data: { avatarKey: null },
    });
    cleared = updated.count === 1;
  } catch {
    console.error("Event media reference update failed.");
    throw new EventMediaError("unavailable");
  }
  if (!cleared) throw new EventMediaError("conflict");

  return {
    eventId,
    slug: event.slug,
    objectKey: null,
    cleanupFailed: await deletePreviousObject(expectedKey),
  };
}

/**
 * Deletes avatar bytes for a host row that has already been removed.
 * Refuses when the key is still a cover or any host avatar.
 */
export async function deleteRemovedHostAvatar(objectKey: string | null): Promise<void> {
  if (objectKey === null) return;
  if (!isDeletableObjectKey(objectKey)) throw new EventMediaError("invalid_input");

  const referenced = await loadReferencedEventMediaKeys();
  if (referenced.has(objectKey)) throw new EventMediaError("conflict");

  try {
    await deleteEventMediaObject(objectKey);
  } catch (error) {
    if (error instanceof EventMediaError && error.code === "invalid_input") throw error;
    console.error("Event media could not delete a removed host avatar.", { objectKey });
    throw new EventMediaError("cleanup_failed");
  }
}

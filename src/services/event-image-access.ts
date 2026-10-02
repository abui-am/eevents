import "server-only";

import type { EventStatus } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EventMediaError } from "@/lib/event-media-error";
import { downloadEventMediaObject } from "@/lib/event-media-storage";

/**
 * Published and cancelled images for visitors use a private 60-second cache.
 * A visibility change or replacement can leave the previous bytes cached until
 * that lifetime ends. Draft images and administrator responses use no-store.
 */
export const PUBLISHED_EVENT_IMAGE_CACHE = "private, max-age=60";
export const ADMIN_EVENT_IMAGE_CACHE = "no-store";

export type EventImageCacheControl =
  | typeof PUBLISHED_EVENT_IMAGE_CACHE
  | typeof ADMIN_EVENT_IMAGE_CACHE;

export type EventImageRead =
  | { status: 404 }
  | { status: 503 }
  | { status: 200; bytes: Buffer; cacheControl: EventImageCacheControl };

function cacheControl(status: EventStatus, viewerIsAdmin: boolean): EventImageCacheControl {
  if (status === "DRAFT" || viewerIsAdmin) return ADMIN_EVENT_IMAGE_CACHE;
  return PUBLISHED_EVENT_IMAGE_CACHE;
}

async function readStoredImage(
  objectKey: string | null,
  control: EventImageCacheControl,
): Promise<EventImageRead> {
  if (!objectKey) return { status: 404 };

  try {
    const bytes = await downloadEventMediaObject(objectKey);
    if (!bytes) return { status: 404 };
    return { status: 200, bytes, cacheControl: control };
  } catch (error) {
    if (error instanceof EventMediaError && error.code === "invalid_input") {
      return { status: 404 };
    }
    console.error("Event image could not be read.");
    return { status: 503 };
  }
}

export async function readEventCover(
  slug: string,
  viewer: AuthenticatedUser | null,
): Promise<EventImageRead> {
  const event = await db.event.findUnique({
    where: { slug },
    select: { status: true, coverKey: true },
  });
  if (!event) return { status: 404 };

  const viewerIsAdmin = viewer?.role === "ADMIN";
  if (event.status === "DRAFT" && !viewerIsAdmin) return { status: 404 };
  return readStoredImage(event.coverKey, cacheControl(event.status, viewerIsAdmin));
}

export async function readHostAvatar(
  slug: string,
  hostId: string,
  viewer: AuthenticatedUser | null,
): Promise<EventImageRead> {
  const event = await db.event.findUnique({
    where: { slug },
    select: {
      status: true,
      hosts: {
        where: { id: hostId },
        select: { avatarKey: true },
        take: 1,
      },
    },
  });
  if (!event) return { status: 404 };

  const viewerIsAdmin = viewer?.role === "ADMIN";
  if (event.status === "DRAFT" && !viewerIsAdmin) return { status: 404 };
  const host = event.hosts[0];
  if (!host) return { status: 404 };
  return readStoredImage(host.avatarKey, cacheControl(event.status, viewerIsAdmin));
}

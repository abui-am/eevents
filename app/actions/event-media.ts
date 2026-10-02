"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { EventMediaError } from "@/lib/event-media-error";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { readUploadedImage } from "@/services/image-processing";
import {
  clearEventCover,
  clearHostAvatar,
  parseExpectedObjectKey,
  replaceEventCover,
  replaceHostAvatar,
  type EventMediaChange,
} from "@/services/event-media-service";

const PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

function readId(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !PATH_SEGMENT.test(value)) {
    throw new EventMediaError("invalid_input");
  }
  return value;
}

function readExpectedKey(formData: FormData): string | null {
  if (!formData.has("expectedKey")) throw new EventMediaError("invalid_input");
  const value = formData.get("expectedKey");
  if (typeof value !== "string") throw new EventMediaError("invalid_input");
  return parseExpectedObjectKey(value);
}

async function readImage(formData: FormData): Promise<Buffer> {
  const value = formData.get("image");
  if (!(value instanceof File)) throw new EventMediaError("invalid_input");
  return readUploadedImage(value);
}

function confirmed(formData: FormData): void {
  if (formData.get("confirm") !== "delete") throw new EventMediaError("invalid_input");
}

function errorCode(error: unknown): string {
  if (error instanceof EventMediaError) return error.code;
  console.error("Event image action failed.");
  return "unavailable";
}

function withQuery(path: string, query: Record<string, string>): string {
  return `${path}?${new URLSearchParams(query).toString()}`;
}

function revalidateEvent(eventId: string, slug: string, hostId?: string): void {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath(`/events/${slug}`);
  if (hostId) revalidatePath(`/admin/events/${eventId}/hosts/${hostId}`);
}

function finish(
  eventId: string,
  path: string,
  result: EventMediaChange | null,
  failure: string | null,
  hostId?: string,
): never {
  if (result) revalidateEvent(eventId, result.slug, hostId);
  if (result?.cleanupFailed) {
    redirect(withQuery(path, { imageError: "cleanup_failed" }));
  }
  if (!result) redirect(withQuery(path, { imageError: failure ?? "unavailable" }));
  redirect(withQuery(path, { imageSaved: "1" }));
}

export async function replaceEventCoverAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let eventId = "";
  let result: EventMediaChange | null = null;
  let failure: string | null = null;

  try {
    eventId = readId(formData, "eventId");
    await assertMutationOrigin();
    result = await replaceEventCover(
      eventId,
      readExpectedKey(formData),
      await readImage(formData),
    );
  } catch (error) {
    failure = errorCode(error);
  }

  const path = eventId
    ? `/admin/events/${encodeURIComponent(eventId)}/edit`
    : "/admin";
  finish(eventId, path, result, failure);
}

export async function removeEventCoverAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let eventId = "";
  let result: EventMediaChange | null = null;
  let failure: string | null = null;

  try {
    eventId = readId(formData, "eventId");
    await assertMutationOrigin();
    confirmed(formData);
    result = await clearEventCover(eventId, readExpectedKey(formData));
  } catch (error) {
    failure = errorCode(error);
  }

  const path = eventId
    ? `/admin/events/${encodeURIComponent(eventId)}/edit`
    : "/admin";
  finish(eventId, path, result, failure);
}

export async function replaceHostAvatarAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let eventId = "";
  let hostId = "";
  let result: EventMediaChange | null = null;
  let failure: string | null = null;

  try {
    eventId = readId(formData, "eventId");
    hostId = readId(formData, "hostId");
    await assertMutationOrigin();
    result = await replaceHostAvatar(
      eventId,
      hostId,
      readExpectedKey(formData),
      await readImage(formData),
    );
  } catch (error) {
    failure = errorCode(error);
  }

  const path =
    eventId && hostId
      ? `/admin/events/${encodeURIComponent(eventId)}/hosts/${encodeURIComponent(hostId)}`
      : "/admin";
  finish(eventId, path, result, failure, hostId || undefined);
}

export async function removeHostAvatarAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let eventId = "";
  let hostId = "";
  let result: EventMediaChange | null = null;
  let failure: string | null = null;

  try {
    eventId = readId(formData, "eventId");
    hostId = readId(formData, "hostId");
    await assertMutationOrigin();
    confirmed(formData);
    result = await clearHostAvatar(eventId, hostId, readExpectedKey(formData));
  } catch (error) {
    failure = errorCode(error);
  }

  const path =
    eventId && hostId
      ? `/admin/events/${encodeURIComponent(eventId)}/hosts/${encodeURIComponent(hostId)}`
      : "/admin";
  finish(eventId, path, result, failure, hostId || undefined);
}

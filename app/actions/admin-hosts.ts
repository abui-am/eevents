"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hostErrorPath, type EnteredHostFields } from "@app/admin/admin-utils";
import { requireAdmin } from "@/lib/auth";
import { EventMediaError } from "@/lib/event-media-error";
import { hostInputSchema } from "@/lib/validation";
import { getAdminEvent } from "@/services/admin-event-service";
import { deleteRemovedHostAvatar } from "@/services/event-media-service";
import {
  EventHostError,
  createEventHost,
  moveEventHostDown,
  moveEventHostUp,
  removeEventHost,
  updateEventHost,
} from "@/services/event-host-service";

function value(formData: FormData, key: string): string {
  const formValue = formData.get(key);
  return typeof formValue === "string" ? formValue : "";
}

function readId(formData: FormData, key: string): string | null {
  const id = value(formData, key).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return id;
}

function hostFields(formData: FormData): EnteredHostFields {
  return {
    name: value(formData, "name"),
    biography: value(formData, "biography"),
    publicEmail: value(formData, "publicEmail"),
  };
}

function hostValidationCode(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string {
  const field = issues[0]?.path[0];
  if (field === "name") return "invalid_name";
  if (field === "biography") return "invalid_biography";
  if (field === "publicEmail") return "invalid_email";
  return "invalid_input";
}

function hostFailureCode(error: unknown): string {
  return error instanceof EventHostError ? error.code : "unavailable";
}

function readEventId(formData: FormData): string {
  const eventId = readId(formData, "eventId");
  if (!eventId) redirect("/admin");
  return eventId;
}

function hostListLocation(eventId: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `/admin/events/${encodeURIComponent(eventId)}/edit?${search}#hosts`;
}

async function revalidateHostViews(eventId: string, hostId?: string): Promise<void> {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/my");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath(`/admin/events/${eventId}/hosts/new`);
  if (hostId) revalidatePath(`/admin/events/${eventId}/hosts/${hostId}`);
  const event = await getAdminEvent(eventId);
  if (event) revalidatePath(`/events/${event.slug}`);
}

function hostWrite(fields: EnteredHostFields) {
  return {
    name: fields.name,
    biography: fields.biography,
    publicEmail: fields.publicEmail,
  };
}

export async function createEventHostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = readEventId(formData);
  const fields = hostFields(formData);
  const formPath = `/admin/events/${encodeURIComponent(eventId)}/hosts/new`;
  const parsed = hostInputSchema.safeParse(hostWrite(fields));
  if (!parsed.success) {
    redirect(hostErrorPath(formPath, hostValidationCode(parsed.error.issues), fields));
  }

  let createdHostId = "";
  try {
    const created = await createEventHost(eventId, {
      name: parsed.data.name,
      biography: parsed.data.biography,
      publicEmail: parsed.data.publicEmail,
    });
    createdHostId = created.hostId;
  } catch (error) {
    redirect(hostErrorPath(formPath, hostFailureCode(error), fields));
  }

  await revalidateHostViews(eventId, createdHostId);
  redirect(hostListLocation(eventId, { hostSaved: "1" }));
}

export async function updateEventHostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = readEventId(formData);
  const hostId = readId(formData, "hostId");
  const fields = hostFields(formData);
  if (!hostId) redirect(hostListLocation(eventId, { hostError: "host_not_found" }));

  const formPath = `/admin/events/${encodeURIComponent(eventId)}/hosts/${encodeURIComponent(hostId)}`;
  const parsed = hostInputSchema.safeParse(hostWrite(fields));
  if (!parsed.success) {
    redirect(hostErrorPath(formPath, hostValidationCode(parsed.error.issues), fields));
  }

  try {
    await updateEventHost(eventId, hostId, {
      name: parsed.data.name,
      biography: parsed.data.biography,
      publicEmail: parsed.data.publicEmail,
    });
  } catch (error) {
    const code = hostFailureCode(error);
    if (code === "host_not_found" || code === "event_not_found") {
      redirect(hostListLocation(eventId, { hostError: code }));
    }
    redirect(hostErrorPath(formPath, code, fields));
  }

  await revalidateHostViews(eventId, hostId);
  redirect(`${formPath}?saved=1`);
}

async function moveHost(formData: FormData, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const eventId = readEventId(formData);
  const hostId = readId(formData, "hostId");
  if (!hostId) redirect(hostListLocation(eventId, { hostError: "host_not_found" }));

  try {
    if (direction === "up") await moveEventHostUp(eventId, hostId);
    else await moveEventHostDown(eventId, hostId);
  } catch (error) {
    redirect(hostListLocation(eventId, { hostError: hostFailureCode(error) }));
  }

  await revalidateHostViews(eventId, hostId);
  redirect(hostListLocation(eventId, { hostSaved: "1" }));
}

export async function moveEventHostUpAction(formData: FormData): Promise<void> {
  await moveHost(formData, "up");
}

export async function moveEventHostDownAction(formData: FormData): Promise<void> {
  await moveHost(formData, "down");
}

/** Returns true when the removed host's object could not be deleted. */
async function discardRemovedHostAvatar(objectKey: string | null): Promise<boolean> {
  try {
    await deleteRemovedHostAvatar(objectKey);
    return false;
  } catch (error) {
    if (error instanceof EventMediaError && error.code === "conflict") return false;
    if (!(error instanceof EventMediaError && error.code === "cleanup_failed")) {
      console.error("Removed host avatar cleanup failed.");
    }
    return true;
  }
}

async function removeScopedHost(formData: FormData): Promise<{
  removedAvatarKey: string | null;
  cleanupFailed: boolean;
}> {
  await requireAdmin();
  const eventId = readEventId(formData);
  const hostId = readId(formData, "hostId");
  if (!hostId) redirect(hostListLocation(eventId, { hostError: "host_not_found" }));

  try {
    const removed = await removeEventHost(eventId, hostId);
    const cleanupFailed = await discardRemovedHostAvatar(removed.removedAvatarKey);
    await revalidateHostViews(eventId, hostId);
    return { removedAvatarKey: removed.removedAvatarKey, cleanupFailed };
  } catch (error) {
    redirect(hostListLocation(eventId, { hostError: hostFailureCode(error) }));
  }
}

export async function removeEventHostAction(formData: FormData): Promise<{
  removedAvatarKey: string | null;
}> {
  const removed = await removeScopedHost(formData);
  return { removedAvatarKey: removed.removedAvatarKey };
}

export async function removeEventHostFormAction(formData: FormData): Promise<void> {
  const removed = await removeScopedHost(formData);
  const eventId = readEventId(formData);
  redirect(
    hostListLocation(
      eventId,
      removed.cleanupFailed
        ? { hostSaved: "1", imageError: "cleanup_failed" }
        : { hostSaved: "1" },
    ),
  );
}

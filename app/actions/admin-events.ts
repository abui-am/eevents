"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eventErrorPath } from "@app/admin/admin-utils";
import { requireAdmin } from "@/lib/auth";
import { mapUrlValueSchema } from "@/lib/validation";
import {
  AdminEventError,
  saveAdminEvent,
  setAdminRegistrationStatus,
} from "@/services/admin-event-service";

function value(formData: FormData, key: string): string {
  const formValue = formData.get(key);
  return typeof formValue === "string" ? formValue : "";
}

function getErrorCode(error: unknown): string {
  return error instanceof AdminEventError ? error.code : "unavailable";
}

function eventFailureCode(formData: FormData, error: unknown): string {
  const code = getErrorCode(error);
  if (code !== "invalid_input") return code;
  const mapUrl = formData.get("mapUrl");
  if (typeof mapUrl === "string" && !mapUrlValueSchema.safeParse(mapUrl).success) {
    return "map_url";
  }
  return code;
}

function eventInput(formData: FormData) {
  return {
    title: value(formData, "title"),
    description: value(formData, "description"),
    location: value(formData, "location"),
    startsAt: value(formData, "startsAt"),
    endsAt: value(formData, "endsAt"),
    timeZone: formData.has("timeZone") ? value(formData, "timeZone") : "UTC",
    capacity: value(formData, "capacity"),
    status: value(formData, "status"),
    ...(formData.has("venueName") ? { venueName: value(formData, "venueName") } : {}),
    ...(formData.has("venueAddress")
      ? { venueAddress: value(formData, "venueAddress") }
      : {}),
    ...(formData.has("mapUrl") ? { mapUrl: value(formData, "mapUrl") } : {}),
  };
}

export async function createAdminEventAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  let created: { id: string; slug: string } | null = null;
  let errorCode: string | null = null;

  try {
    created = await saveAdminEvent(admin.id, null, eventInput(formData));
  } catch (error) {
    errorCode = eventFailureCode(formData, error);
  }

  if (!created) {
    redirect(eventErrorPath("/admin/events/new", errorCode ?? "unavailable", formData));
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/events/${created.slug}`);
  redirect(`/admin/events/${created.id}?saved=1`);
}

export async function updateAdminEventAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = value(formData, "eventId");
  let saved: { id: string; slug: string } | null = null;
  let errorCode: string | null = null;

  try {
    saved = await saveAdminEvent(admin.id, eventId, eventInput(formData));
  } catch (error) {
    errorCode = eventFailureCode(formData, error);
  }

  const editUrl = `/admin/events/${encodeURIComponent(eventId)}/edit`;
  if (!saved) redirect(eventErrorPath(editUrl, errorCode ?? "unavailable", formData));

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/admin/events/${saved.id}`);
  revalidatePath(`/admin/events/${saved.id}/edit`);
  revalidatePath(`/events/${saved.slug}`);
  redirect(`/admin/events/${saved.id}?saved=1`);
}

export async function setAdminRegistrationStatusAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const eventId = value(formData, "eventId");
  const registrationId = value(formData, "registrationId");
  let result: { eventId: string; eventSlug: string } | null = null;
  let errorCode: string | null = null;

  try {
    result = await setAdminRegistrationStatus({
      eventId,
      registrationId,
      nextStatus: value(formData, "nextStatus"),
    });
  } catch (error) {
    errorCode = getErrorCode(error);
  }

  const eventUrl = `/admin/events/${encodeURIComponent(eventId)}`;
  if (!result) redirect(`${eventUrl}?statusError=${errorCode ?? "unavailable"}`);

  revalidatePath(`/admin/events/${result.eventId}`);
  revalidatePath("/admin");
  revalidatePath("/my");
  revalidatePath("/");
  revalidatePath(`/events/${result.eventSlug}`);
  redirect(`${eventUrl}?statusSaved=1`);
}

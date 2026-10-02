"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { checkInReturnPath } from "@/lib/redirects";
import {
  CheckInError,
  confirmQrCheckIn,
  manuallyCheckIn,
  undoCheckIn,
  getCheckInReview,
  CHECK_IN_ERROR_MESSAGES,
} from "@/services/check-in-service";

export async function reviewScannedTicketAction(eventId: string, ticket: string): Promise<
  { href: string; error?: never } | { href?: never; error: string }
> {
  await requireAdmin();
  const href = checkInReturnPath(eventId, ticket);
  if (!href) return { error: "This QR ticket is invalid. Scan a valid participant ticket." };
  try {
    const review = await getCheckInReview(eventId, ticket);
    if (!review) return { error: "This ticket is invalid or no longer eligible. Ask the participant to open their latest ticket." };
    return { href };
  } catch {
    return { error: "Could not check the ticket right now. Please try scanning again." };
  }
}

/** Only this authenticated POST records a decoded onsite scan. */
export async function scanTicketAction(eventId: string, ticket: string): Promise<
  { href: string; outcome: "arrived" | "already-arrived" | "certified" | "already-certified"; certificateHref: string | null } |
  { error: string }
> {
  const admin = await requireAdmin();
  const returnPath = checkInReturnPath(eventId, ticket);
  if (!returnPath) return { error: CHECK_IN_ERROR_MESSAGES.invalid_ticket };
  try {
    const result = await confirmQrCheckIn(admin.id, eventId, ticket);
    refreshEvent(eventId);
    return { href: withQuery(returnPath, "result", result.outcome), outcome: result.outcome, certificateHref: result.certificateHref };
  } catch (error) {
    return { error: error instanceof CheckInError ? CHECK_IN_ERROR_MESSAGES[error.code] : CHECK_IN_ERROR_MESSAGES.unavailable };
  }
}

function value(formData: FormData, key: string): string {
  const formValue = formData.get(key);
  return typeof formValue === "string" ? formValue : "";
}

function eventPath(eventId: string): string {
  return /^[A-Za-z0-9_-]{1,180}$/.test(eventId)
    ? `/admin/events/${eventId}`
    : "/admin";
}

function withQuery(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function errorCode(error: unknown): string {
  return error instanceof CheckInError ? error.code : "unavailable";
}

function refreshEvent(eventId: string): void {
  revalidatePath(eventPath(eventId));
  revalidatePath("/my");
  revalidatePath("/");
}

export async function confirmQrCheckInAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = value(formData, "eventId");
  const ticket = value(formData, "ticket");
  const returnPath = checkInReturnPath(eventId, ticket);
  if (!returnPath) redirect(withQuery(eventPath(eventId), "checkInError", "invalid_input"));

  let result: Awaited<ReturnType<typeof confirmQrCheckIn>> | null = null;
  let failure: string | null = null;
  try {
    result = await confirmQrCheckIn(admin.id, eventId, ticket);
  } catch (error) {
    failure = errorCode(error);
  }

  if (!result) {
    refreshEvent(eventId);
    redirect(withQuery(returnPath, "error", failure ?? "unavailable"));
  }

  refreshEvent(eventId);
  redirect(withQuery(returnPath, "result", result.outcome));
}

export async function manualCheckInAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = value(formData, "eventId");
  const registrationId = value(formData, "registrationId");
  const path = eventPath(eventId);

  let result: Awaited<ReturnType<typeof manuallyCheckIn>> | null = null;
  let failure: string | null = null;
  try {
    result = await manuallyCheckIn(admin.id, eventId, registrationId);
  } catch (error) {
    failure = errorCode(error);
  }

  if (!result) {
    refreshEvent(eventId);
    redirect(withQuery(path, "checkInError", failure ?? "unavailable"));
  }

  refreshEvent(eventId);
  redirect(withQuery(path, "checkInResult", result.outcome));
}

export async function undoCheckInAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = value(formData, "eventId");
  const registrationId = value(formData, "registrationId");
  const path = eventPath(eventId);

  let result: Awaited<ReturnType<typeof undoCheckIn>> | null = null;
  let failure: string | null = null;
  try {
    result = await undoCheckIn(admin.id, eventId, registrationId);
  } catch (error) {
    failure = errorCode(error);
  }

  if (!result) {
    refreshEvent(eventId);
    redirect(withQuery(path, "checkInError", failure ?? "unavailable"));
  }

  refreshEvent(eventId);
  redirect(withQuery(path, "checkInResult", result.undone ? "undone" : "already-undone"));
}

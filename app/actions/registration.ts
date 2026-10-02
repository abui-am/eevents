"use server";

import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { QuestionnaireSubmissionError } from "@/lib/questionnaire-submission";
import {
  applyToEvent,
  cancelOwnRegistration,
} from "@/services/registration-service";

const eventSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
const registrationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export async function applyForEventAction(formData: FormData): Promise<void> {
  const eventSlug = eventSlugSchema.safeParse(formData.get("eventSlug"));
  if (!eventSlug.success) redirect("/?registration=unavailable");

  const eventPath = `/events/${eventSlug.data}`;
  const user = await requireUser(eventPath);
  let result;
  try {
    result = await applyToEvent(user.id, eventSlug.data);
  } catch (error) {
    if (error instanceof QuestionnaireSubmissionError) redirect(`${eventPath}/apply`);
    throw error;
  }
  redirect(`${eventPath}?registration=${result}`);
}

export async function cancelOwnRegistrationAction(
  formData: FormData,
): Promise<void> {
  const registrationId = registrationIdSchema.safeParse(
    formData.get("registrationId"),
  );
  if (!registrationId.success) redirect("/my?registration=unavailable");

  const user = await requireUser();
  const result = await cancelOwnRegistration(user.id, registrationId.data);
  redirect(`/my?registration=${result}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { compatibleAnswers, readQuestions, type AnswerValues, type Question } from "@/lib/questionnaire";
import { QuestionnaireSubmissionError, type ApplicationFormState } from "@/lib/questionnaire-submission";
import { QuestionnaireError, QUESTIONNAIRE_ERRORS, saveQuestionnaire } from "@/services/questionnaire-service";
import { applyToEvent } from "@/services/registration-service";

export type EditorState = { revision: number; questions: Question[]; message?: string; error?: string; versionNumber?: number | null; saved?: boolean; unpublished?: boolean };

export async function saveQuestionnaireAction(eventId: string, previous: EditorState, formData: FormData): Promise<EditorState> {
  const admin = await requireAdmin();
  const raw = formData.get("questions");
  if (typeof raw !== "string" || raw.length > 100000) return { ...previous, saved: false, error: "The questionnaire is too large or invalid." };
  try {
    const result = await saveQuestionnaire(admin.id, eventId, Number(formData.get("revision")), JSON.parse(raw), formData.get("intent") === "publish");
    revalidatePath(`/admin/events/${eventId}/questions`);
    const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
    if (event) revalidatePath(`/events/${event.slug}`);
    return { ...result, versionNumber: result.versionNumber ?? previous.versionNumber, saved: true, message: result.versionNumber ? `Version ${result.versionNumber} published. Future applications will use these questions.` : "Draft saved. Participants still see the published questions." };
  } catch (error) {
    return { ...previous, saved: false, error: error instanceof QuestionnaireError ? QUESTIONNAIRE_ERRORS[error.code] : "We could not save the questionnaire. Try again." };
  }
}

const RESULT_MESSAGES: Record<string, string> = {
  full: "All places are reserved. Your answers have not been submitted.",
  closed: "Registration closed when the event started.",
  declined: "An administrator declined this application. Only an administrator can reopen it.",
  unavailable: "We could not submit your application. Try again.",
};

export async function submitQuestionnaireAction(slug: string, _previous: ApplicationFormState, formData: FormData): Promise<ApplicationFormState> {
  const user = await requireUser(`/events/${slug}/apply`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) return { message: "This event could not be found." };
  const raw = formData.get("answers");
  let values: AnswerValues;
  try {
    if (typeof raw !== "string" || raw.length > 100000) throw new Error("invalid");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string" && !(Array.isArray(value) && value.every((item) => typeof item === "string")))) throw new Error("invalid");
    values = parsed as AnswerValues;
  } catch {
    return { message: "Check your answers and try again." };
  }
  let result;
  try {
    result = await applyToEvent(user.id, slug, { versionId: String(formData.get("versionId") ?? "") || null, answers: values });
  } catch (error) {
    if (error instanceof QuestionnaireSubmissionError) {
      if (error.code === "changed" || error.code === "required") {
        const event = await db.event.findUnique({ where: { slug }, include: { currentQuestionnaireVersion: true } });
        const questions = readQuestions(event?.currentQuestionnaireVersion?.questions ?? []);
        return { changed: true, message: "The registration questions changed. Review the updated questions before submitting again.", values: compatibleAnswers(questions, values), questionnaire: { versionId: event?.currentQuestionnaireVersionId ?? null, questions } };
      }
      return { values, message: "Check the highlighted answers and submit again.", fieldErrors: error.fieldErrors };
    }
    return { values, message: "We could not submit your application. Try again." };
  }
  if (["applied", "reapplied", "already"].includes(result)) {
    revalidatePath(`/events/${slug}`);
    revalidatePath("/my");
    redirect(`/events/${slug}?registration=${result}`);
  }
  return { values, message: RESULT_MESSAGES[result] ?? RESULT_MESSAGES.unavailable };
}

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type RegistrationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { answerSchema, blankAnswers, normalizeAnswers, readQuestions } from "@/lib/questionnaire";
import { QuestionnaireSubmissionError, type QuestionnaireSubmission } from "@/lib/questionnaire-submission";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type ApplyResult =
  | "applied"
  | "reapplied"
  | "already"
  | "declined"
  | "full"
  | "closed"
  | "unavailable";

export type ParticipantCancellationResult =
  | "cancelled"
  | "late"
  | "not-cancellable"
  | "unavailable";

function isSerializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

async function retrySerializable<T>(
  operation: () => Promise<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializableConflict(error)) throw error;
    }
  }

  return null;
}

async function activeRegistrationExists(userId: string, eventId: string) {
  return db.registration.findUnique({
    where: { userId_eventId: { userId, eventId } },
    select: { status: true },
  });
}

/**
 * Create or restore a registration while serializing the seat count check.
 * The caller must pass the authenticated user's ID, never an ID from a form.
 */
export async function applyToEvent(
  userId: string,
  eventSlug: string,
  submission?: QuestionnaireSubmission,
): Promise<ApplyResult> {
  try {
    const result = await retrySerializable(async () => {
      return db.$transaction(
        async (transaction) => {
          const event = await transaction.event.findUnique({
            where: { slug: eventSlug },
            select: { id: true, startsAt: true, capacity: true, status: true, currentQuestionnaireVersionId: true, currentQuestionnaireVersion: true },
          });

          if (!event || event.status !== "PUBLISHED") return "unavailable";
          if (event.startsAt <= new Date()) return "closed";

          const existing = await transaction.registration.findUnique({
            where: { userId_eventId: { userId, eventId: event.id } },
            select: { id: true, status: true, cancelledBy: true },
          });

          if (existing && existing.status !== "CANCELLED") return "already";
          if (existing?.cancelledBy === "ADMIN") return "declined";

          const questions = readQuestions(event.currentQuestionnaireVersion?.questions ?? []);
          if (!submission && questions.length) throw new QuestionnaireSubmissionError("required");
          if (submission && submission.versionId !== event.currentQuestionnaireVersionId) throw new QuestionnaireSubmissionError("changed");
          const rawAnswers = submission ? submission.answers : blankAnswers(questions);
          if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) throw new QuestionnaireSubmissionError("invalid");
          const answers = answerSchema(questions).safeParse({ ...blankAnswers(questions), ...rawAnswers });
          if (!answers.success) {
            const fieldErrors = Object.fromEntries(answers.error.issues.map((issue) => [String(issue.path[0] ?? "root"), issue.message]));
            throw new QuestionnaireSubmissionError("invalid", fieldErrors);
          }
          const storedAnswers = normalizeAnswers(questions, answers.data);

          const occupiedSeats = await transaction.registration.count({
            where: { eventId: event.id, status: { not: "CANCELLED" } },
          });
          if (occupiedSeats >= event.capacity) return "full";

          if (existing) {
            const reopened = await transaction.registration.updateMany({
              where: {
                id: existing.id,
                status: "CANCELLED",
                cancelledBy: "PARTICIPANT",
              },
              data: {
                status: "REGISTERED" satisfies RegistrationStatus,
                cancelledBy: null,
                checkInTicketVersion: randomUUID(),
                checkedInAt: null,
                checkedInById: null,
                questionnaireVersionId: event.currentQuestionnaireVersionId,
              },
            });

            if (reopened.count !== 1) return "unavailable";
            await transaction.registrationAnswer.deleteMany({ where: { registrationId: existing.id } });
            if (storedAnswers.length) await transaction.registrationAnswer.createMany({ data: storedAnswers.map((answer) => ({ ...answer, registrationId: existing.id })) });
            return "reapplied";
          }

          const registration = await transaction.registration.create({
            data: { userId, eventId: event.id, status: "REGISTERED", checkInTicketVersion: randomUUID(), questionnaireVersionId: event.currentQuestionnaireVersionId },
            select: { id: true },
          });
          if (storedAnswers.length) await transaction.registrationAnswer.createMany({ data: storedAnswers.map((answer) => ({ ...answer, registrationId: registration.id })) });

          return "applied";
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });

    return result ?? "unavailable";
  } catch (error) {
    if (error instanceof QuestionnaireSubmissionError) throw error;
    if (isUniqueConstraintError(error)) {
      try {
        const existing = await db.event.findUnique({
          where: { slug: eventSlug },
          select: {
            id: true,
            startsAt: true,
            status: true,
          },
        });
        if (!existing || existing.status !== "PUBLISHED") return "unavailable";
        if (existing.startsAt <= new Date()) return "closed";

        const registration = await activeRegistrationExists(userId, existing.id);
        if (registration && registration.status !== "CANCELLED") return "already";
      } catch {
        console.error("Could not resolve a concurrent registration attempt.");
      }

      return "unavailable";
    }

    console.error("Event registration failed.");
    return "unavailable";
  }
}

/** Cancel a participant-owned reservation and revoke any current ticket. */
export async function cancelOwnRegistration(
  userId: string,
  registrationId: string,
): Promise<ParticipantCancellationResult> {
  try {
    const result = await retrySerializable(async () => {
      return db.$transaction(
        async (transaction) => {
          const registration = await transaction.registration.findFirst({
            where: { id: registrationId, userId },
            select: {
              id: true,
              status: true,
              event: { select: { startsAt: true } },
            },
          });

          if (
            !registration ||
            (registration.status !== "REGISTERED" &&
              registration.status !== "CONFIRMED")
          ) {
            return "not-cancellable";
          }

          if (registration.event.startsAt <= new Date()) return "late";

          const cancelled = await transaction.registration.updateMany({
            where: {
              id: registration.id,
              userId,
              status: { in: ["REGISTERED", "CONFIRMED"] },
            },
            data: {
              status: "CANCELLED",
              cancelledBy: "PARTICIPANT",
              checkInTicketVersion: null,
              checkedInAt: null,
              checkedInById: null,
            },
          });

          return cancelled.count === 1 ? "cancelled" : "not-cancellable";
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });

    return result ?? "unavailable";
  } catch {
    console.error("Participant registration cancellation failed.");
    return "unavailable";
  }
}

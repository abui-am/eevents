import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { questionnaireSchema, questionnaireFilterSchema, readQuestions, isChoice, type Question, type AnswerFilter } from "@/lib/questionnaire";

export class QuestionnaireError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "locked" | "not-found" | "forbidden") { super(code); }
}
export const QUESTIONNAIRE_ERRORS = {
  invalid: "Check the questions and options. Changing a question's meaning or type requires a new question.",
  conflict: "The questionnaire changed while you were editing. Reload before saving again.",
  locked: "Questions cannot be changed after the event starts or is cancelled.",
  "not-found": "This event could not be found.", forbidden: "Only administrators can manage questions.",
};

async function verifyAdmin(adminId: string) {
  const user = await db.user.findUnique({ where: { id: adminId }, select: { role: true } });
  if (user?.role !== "ADMIN") throw new QuestionnaireError("forbidden");
}

/** Reads never create drafts. An absent draft has revision zero. */
export async function getQuestionnaireEditor(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId }, include: { questionnaireDraft: true, currentQuestionnaireVersion: true },
  });
  if (!event) return null;
  const published = event.currentQuestionnaireVersion;
  const questions = readQuestions(event.questionnaireDraft?.questions ?? published?.questions ?? []);
  return { event, questions, revision: event.questionnaireDraft?.revision ?? 0,
    unpublished: JSON.stringify(questions) !== JSON.stringify(readQuestions(published?.questions ?? [])),
    locked: event.status === "CANCELLED" || event.startsAt <= new Date(),
  };
}

function verifyIdentities(questions: Question[], history: Question[][]) {
  const oldQuestions = new Map(history.flat().map((question) => [question.id, question.type]));
  const optionOwners = new Map(history.flat().flatMap((question) => question.options.map((option) => [option.id, question.id] as const)));
  for (const question of questions) {
    if (optionOwners.has(question.id)) throw new QuestionnaireError("invalid");
    if (oldQuestions.has(question.id) && oldQuestions.get(question.id) !== question.type) throw new QuestionnaireError("invalid");
    for (const option of question.options) {
      if (optionOwners.has(option.id) && optionOwners.get(option.id) !== question.id) throw new QuestionnaireError("invalid");
      if (oldQuestions.has(option.id) || optionOwners.has(question.id)) throw new QuestionnaireError("invalid");
    }
  }
}

export async function saveQuestionnaire(adminId: string, eventId: string, revision: number, rawQuestions: unknown, publish: boolean) {
  await verifyAdmin(adminId);
  const parsed = questionnaireSchema.safeParse({ questions: rawQuestions });
  if (!parsed.success || !Number.isSafeInteger(revision) || revision < 0) throw new QuestionnaireError("invalid");
  try {
    return await db.$transaction(async (transaction) => {
      const event = await transaction.event.findUnique({ where: { id: eventId }, include: { questionnaireDraft: true, questionnaireVersions: { orderBy: { number: "desc" } } } });
      if (!event) throw new QuestionnaireError("not-found");
      if (event.status === "CANCELLED" || event.startsAt <= new Date()) throw new QuestionnaireError("locked");
      if ((event.questionnaireDraft?.revision ?? 0) !== revision) throw new QuestionnaireError("conflict");
      verifyIdentities(parsed.data.questions, event.questionnaireVersions.map((version) => readQuestions(version.questions)));
      const questions = parsed.data.questions as Prisma.InputJsonValue;
      const draft = await transaction.questionnaireDraft.upsert({ where: { eventId }, create: { eventId, questions, revision: 1 }, update: { questions, revision: { increment: 1 } } });
      let versionNumber: number | null = null;
      if (publish) {
        versionNumber = (event.questionnaireVersions[0]?.number ?? 0) + 1;
        const version = await transaction.questionnaireVersion.create({ data: { eventId, number: versionNumber, questions } });
        await transaction.event.update({ where: { id: eventId }, data: { currentQuestionnaireVersionId: version.id } });
      }
      const current = event.questionnaireVersions.find((version) => version.id === event.currentQuestionnaireVersionId);
      return { revision: draft.revision, versionNumber, questions: parsed.data.questions,
        unpublished: !publish && JSON.stringify(parsed.data.questions) !== JSON.stringify(readQuestions(current?.questions ?? [])),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw new QuestionnaireError("conflict");
    throw error;
  }
}

export type FilterQuestion = Question & { historical: boolean; historicalOptionIds: string[] };
export async function getFilterQuestions(eventId: string): Promise<FilterQuestion[]> {
  const [event, versions] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { currentQuestionnaireVersionId: true } }),
    db.questionnaireVersion.findMany({ where: { eventId }, orderBy: { number: "desc" } }),
  ]);
  const current = versions.find((version) => version.id === event?.currentQuestionnaireVersionId);
  const currentQuestions = readQuestions(current?.questions ?? []);
  const catalog = new Map<string, FilterQuestion>();
  for (const version of versions) {
    for (const question of readQuestions(version.questions)) {
      const active = currentQuestions.find((item) => item.id === question.id);
      let entry = catalog.get(question.id);
      if (!entry) {
        entry = { ...question, options: [...question.options], historical: !active, historicalOptionIds: [] };
        catalog.set(question.id, entry);
      } else {
        for (const option of question.options) if (!entry.options.some((item) => item.id === option.id)) entry.options.push(option);
      }
      entry.historicalOptionIds = entry.options.filter((option) => !active?.options.some((item) => item.id === option.id)).map((option) => option.id);
    }
  }
  return [...catalog.values()];
}

/** Event-scoped predicates used before counting and pagination. */
export function answerFilterWhere(filters: AnswerFilter[], catalog: FilterQuestion[]): Prisma.RegistrationWhereInput[] {
  if (!questionnaireFilterSchema(catalog).safeParse({ filters }).success) throw new QuestionnaireError("invalid");
  const seen = new Set<string>();
  return filters.map((filter) => {
    const question = catalog.find((item) => item.id === filter.questionId);
    if (!question || seen.has(filter.questionId)) throw new QuestionnaireError("invalid");
    seen.add(filter.questionId);
    const where: Prisma.RegistrationAnswerWhereInput = { questionId: question.id };
    if (filter.operator === "answered") return { answers: { some: where } };
    if (filter.operator === "unanswered") return { answers: { none: where } };
    if (filter.operator === "contains") {
      if (!["SHORT_TEXT", "LONG_TEXT"].includes(question.type) || !filter.value) throw new QuestionnaireError("invalid");
      // Prisma maps contains to LIKE. Escape wildcard characters for a literal substring.
      where.textValue = { contains: filter.value.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" };
    } else if (filter.operator === "any") {
      if (!isChoice(question.type) || !filter.optionIds?.length || filter.optionIds.some((id) => !question.options.some((option) => option.id === id))) throw new QuestionnaireError("invalid");
      where.optionIds = { hasSome: filter.optionIds };
    } else if (filter.operator === "yes" || filter.operator === "no") {
      if (question.type !== "YES_NO") throw new QuestionnaireError("invalid");
      where.booleanValue = filter.operator === "yes";
    } else throw new QuestionnaireError("invalid");
    return { answers: { some: where } };
  });
}

export async function getAnswerReview(registrationId: string, viewer: { id: string; role: string }, eventId?: string) {
  return db.registration.findFirst({
    where: { id: registrationId, ...(viewer.role === "ADMIN" && eventId ? { eventId } : { userId: viewer.id }) },
    include: { participant: { select: { name: true, email: true } }, event: true, questionnaireVersion: true, answers: true },
  });
}

import { z } from "zod";

export const QUESTION_TYPES = ["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "YES_NO"] as const;
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: "Short text", LONG_TEXT: "Long text", SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice", YES_NO: "Yes / no",
};
export type QuestionType = typeof QUESTION_TYPES[number];

const optionSchema = z.object({ id: z.uuid(), label: z.string().trim().min(1, "Enter an option.").max(100, "Use at most 100 characters.") });
export const questionSchema = z.object({
  id: z.uuid(),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "Enter a question.").max(200, "Use at most 200 characters."),
  helperText: z.string().trim().max(500, "Use at most 500 characters."),
  required: z.boolean(),
  options: z.array(optionSchema).max(20, "Use at most 20 options."),
}).superRefine((question, context) => {
  if (isChoice(question.type)) {
    if (question.options.length < 2) context.addIssue({ code: "custom", path: ["options"], message: "Add at least two options." });
    const labels = question.options.map((option) => option.label.toLocaleLowerCase());
    if (new Set(labels).size !== labels.length) context.addIssue({ code: "custom", path: ["options"], message: "Use distinct option labels." });
  } else if (question.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "This question type does not use options." });
  }
});
export const questionnaireSchema = z.object({ questions: z.array(questionSchema).max(20, "Use at most 20 questions.") }).superRefine(({ questions }, context) => {
  const ids = questions.flatMap((question) => [question.id, ...question.options.map((option) => option.id)]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["questions"], message: "Question and option identities must be distinct." });
});
export type Question = z.infer<typeof questionSchema>;
export type AnswerValue = string | string[];
export type AnswerValues = Record<string, AnswerValue>;
export type StoredAnswer = { questionId: string; textValue: string | null; booleanValue: boolean | null; optionIds: string[] };

export function isChoice(type: QuestionType): boolean {
  return type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";
}
export function readQuestions(value: unknown): Question[] {
  return questionnaireSchema.parse({ questions: value }).questions;
}

/** Shared dynamic validation; the server always builds this from a stored version. */
export function answerSchema(questions: Question[]) {
  const fields: Record<string, z.ZodType<AnswerValue, AnswerValue>> = {};
  for (const question of questions) {
    if (question.type === "MULTIPLE_CHOICE") {
      fields[question.id] = z.array(z.string()).max(20).superRefine((values, context) => {
        if (question.required && !values.length) context.addIssue({ code: "custom", message: "Choose at least one option." });
        if (new Set(values).size !== values.length || values.some((value) => !question.options.some((option) => option.id === value))) {
          context.addIssue({ code: "custom", message: "Choose valid options from this question." });
        }
      });
    } else {
      fields[question.id] = z.string().trim().superRefine((value, context) => {
        if (question.required && !value) context.addIssue({ code: "custom", message: "Answer this required question." });
        if (!value) return;
        if (question.type === "YES_NO" && value !== "yes" && value !== "no") context.addIssue({ code: "custom", message: "Choose Yes or No." });
        if (question.type === "SINGLE_CHOICE" && !question.options.some((option) => option.id === value)) context.addIssue({ code: "custom", message: "Choose an option from this question." });
        if (question.type === "SHORT_TEXT" && value.length > 200) context.addIssue({ code: "custom", message: "Use at most 200 characters." });
        if (question.type === "LONG_TEXT" && value.length > 2000) context.addIssue({ code: "custom", message: "Use at most 2,000 characters." });
      });
    }
  }
  return z.object(fields).strict();
}

export function blankAnswers(questions: Question[]): AnswerValues {
  return Object.fromEntries(questions.map((question) => [question.id, question.type === "MULTIPLE_CHOICE" ? [] : ""]));
}
export function compatibleAnswers(questions: Question[], values: AnswerValues): AnswerValues {
  const result = blankAnswers(questions);
  for (const question of questions) {
    const value = values[question.id];
    if (question.type === "MULTIPLE_CHOICE" && Array.isArray(value)) result[question.id] = value.filter((id) => question.options.some((option) => option.id === id));
    else if (typeof value === "string") {
      if (!isChoice(question.type) || question.options.some((option) => option.id === value)) result[question.id] = value;
    }
  }
  return result;
}
export function valuesFromStored(answers: StoredAnswer[]): AnswerValues {
  return Object.fromEntries(answers.map((answer) => [answer.questionId,
    answer.textValue ?? (answer.booleanValue !== null ? answer.booleanValue ? "yes" : "no" : answer.optionIds),
  ]));
}
export function prefillAnswers(questions: Question[], answers: StoredAnswer[]): AnswerValues {
  const values = valuesFromStored(answers);
  for (const question of questions) {
    if (question.type === "SINGLE_CHOICE" && Array.isArray(values[question.id])) values[question.id] = values[question.id][0] ?? "";
  }
  return compatibleAnswers(questions, values);
}
export function normalizeAnswers(questions: Question[], values: AnswerValues): StoredAnswer[] {
  return questions.flatMap((question) => {
    const value = values[question.id];
    if (!value || (Array.isArray(value) && !value.length)) return [];
    return [{ questionId: question.id,
      textValue: question.type === "SHORT_TEXT" || question.type === "LONG_TEXT" ? value as string : null,
      booleanValue: question.type === "YES_NO" ? value === "yes" : null,
      optionIds: question.type === "MULTIPLE_CHOICE" ? value as string[] : question.type === "SINGLE_CHOICE" ? [value as string] : [],
    }];
  });
}

export const ANSWER_OPERATORS = ["answered", "unanswered", "contains", "any", "yes", "no"] as const;
export type AnswerFilter = { questionId: string; operator: typeof ANSWER_OPERATORS[number]; value?: string; optionIds?: string[] };
export const answerFiltersSchema = z.array(z.object({
  questionId: z.uuid(), operator: z.enum(ANSWER_OPERATORS),
  value: z.string().trim().max(200), optionIds: z.array(z.uuid()).max(20),
}).partial({ value: true, optionIds: true }).strict()).max(20);

export function decodeAnswerFilters(raw: string | undefined): AnswerFilter[] {
  if (!raw) return [];
  if (raw.length > 30000) throw new Error("Invalid answer filters.");
  return answerFiltersSchema.parse(JSON.parse(raw));
}

export function questionnaireFilterSchema(questions: Question[]) {
  return z.object({ filters: answerFiltersSchema }).superRefine(({ filters }, context) => {
    const seen = new Set<string>();
    filters.forEach((filter, index) => {
      const question = questions.find((item) => item.id === filter.questionId);
      const invalid = (field: string, message: string) => context.addIssue({ code: "custom", path: ["filters", index, field], message });
      if (!question || seen.has(filter.questionId)) { invalid("questionId", "Choose a different question from this event."); return; }
      seen.add(filter.questionId);
      if (filter.operator === "contains" && (!["SHORT_TEXT", "LONG_TEXT"].includes(question.type) || !filter.value)) invalid("value", "Enter text for a text question.");
      if (filter.operator === "any" && (!isChoice(question.type) || !filter.optionIds?.length || filter.optionIds.some((id) => !question.options.some((option) => option.id === id)))) invalid("optionIds", "Choose at least one valid option.");
      if (["yes", "no"].includes(filter.operator) && question.type !== "YES_NO") invalid("operator", "Use Yes or No only for a yes/no question.");
    });
  });
}

export function answerLabel(question: Question, answer: StoredAnswer | undefined): string {
  if (!answer) return "Not answered";
  if (answer.textValue !== null) return answer.textValue;
  if (answer.booleanValue !== null) return answer.booleanValue ? "Yes" : "No";
  return question.options.filter((option) => answer.optionIds.includes(option.id)).map((option) => option.label).join(", ");
}

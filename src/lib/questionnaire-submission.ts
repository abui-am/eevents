import type { AnswerValues, Question } from "./questionnaire";

export class QuestionnaireSubmissionError extends Error {
  constructor(readonly code: "invalid" | "changed" | "required", readonly fieldErrors: Record<string, string> = {}) { super(code); }
}
export type QuestionnaireSubmission = { versionId: string | null; answers: unknown };
export type ApplicationFormState = {
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: AnswerValues;
  changed?: boolean;
  questionnaire?: { versionId: string | null; questions: Question[] };
};

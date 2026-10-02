"use client";

import { FormProvider, useForm } from "react-hook-form";
import { blankAnswers, type Question } from "@/lib/questionnaire";
import { QuestionFields } from "./question-fields";

export function QuestionnairePreview({ questions }: { questions: Question[] }) {
  const form = useForm({ defaultValues: blankAnswers(questions) });
  return <FormProvider {...form}><QuestionFields questions={questions} preview /></FormProvider>;
}

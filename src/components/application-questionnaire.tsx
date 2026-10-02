"use client";

import { useActionState, useEffect, useMemo, useRef, startTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { answerSchema, type Question, type AnswerValues } from "@/lib/questionnaire";
import type { ApplicationFormState } from "@/lib/questionnaire-submission";
import { QuestionFields } from "./question-fields";
import { Button } from "./ui/button";
import styles from "./questionnaire.module.css";

export function ApplicationQuestionnaire({ questions, versionId, defaults, action }: {
  questions: Question[]; versionId: string | null; defaults: AnswerValues;
  action: (state: ApplicationFormState, data: FormData) => Promise<ApplicationFormState>;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const current = state.questionnaire ?? { questions, versionId };
  const schema = useMemo(() => answerSchema(current.questions), [current.questions]);
  const form = useForm<AnswerValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: "onTouched", reValidateMode: "onChange", shouldFocusError: true });
  const { reset, setError } = form;
  const busy = useRef(false);
  useEffect(() => { if (!pending) busy.current = false; }, [pending]);
  useEffect(() => {
    if (state.values) reset(state.values);
    const entries = Object.entries(state.fieldErrors ?? {});
    for (const [index, [field, message]] of entries.entries()) setError(field, { type: "server", message }, { shouldFocus: index === 0 });
  }, [state, reset, setError]);
  return <FormProvider {...form}>
    <form action={dispatch} noValidate onSubmit={(event) => {
      event.preventDefault();
      if (busy.current || pending) return;
      busy.current = true;
      void form.handleSubmit((values) => {
        const data = new FormData();
        data.set("versionId", current.versionId ?? "");
        data.set("answers", JSON.stringify(values));
        startTransition(() => dispatch(data));
      }, () => { busy.current = false; })(event);
    }}>
      {state.message && <p className={`${styles.notice} ${state.changed ? "" : styles.error}`} role="alert">{state.message}</p>}
      <fieldset className={styles.fieldset} disabled={pending}>
        <QuestionFields questions={current.questions} />
        {!current.questions.length && <p>No additional questions are required for this event.</p>}
      </fieldset>
      <div className={styles.actions}><Button type="submit" disabled={pending}>{pending ? "Submitting application…" : "Submit application"}</Button></div>
      <p className={styles.help}>Submitting reserves a place. An administrator will review your application before issuing a ticket.</p>
    </form>
  </FormProvider>;
}

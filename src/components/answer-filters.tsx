"use client";

import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isChoice, questionnaireFilterSchema, type AnswerFilter } from "@/lib/questionnaire";
import type { FilterQuestion } from "@/services/questionnaire-service";
import { Button } from "./ui/button";
import styles from "./questionnaire.module.css";

export function AnswerFilters({ questions, filters, basePath, status, arrival, query }: {
  questions: FilterQuestion[]; filters: AnswerFilter[]; basePath: string; status?: string; arrival?: string; query: string;
}) {
  const schema = useMemo(() => questionnaireFilterSchema(questions), [questions]);
  const form = useForm<{ filters: AnswerFilter[] }>({ resolver: zodResolver(schema), defaultValues: { filters }, mode: "onTouched", reValidateMode: "onChange" });
  const rows = useFieldArray({ control: form.control, name: "filters" });
  const values = form.watch("filters");
  const [pending, setPending] = useState(false);
  if (!questions.length) return null;
  return <section className={styles.panel} aria-labelledby="answer-filters-title">
    <h3 id="answer-filters-title">Filter by answers</h3>
    <p className={styles.help}>Match all question filters. Questions and options from earlier versions remain available.</p>
    <form className={styles.filterForm} noValidate onSubmit={form.handleSubmit(({ filters: selected }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (arrival) params.set("arrival", arrival);
      if (query) params.set("q", query);
      if (selected.length) params.set("filters", JSON.stringify(selected));
      setPending(true);
      window.location.assign(`${basePath}${params.size ? `?${params.toString()}` : ""}`);
    })}>
      <fieldset className={styles.fieldset} disabled={pending}>
        {rows.fields.map((field, index) => {
          const question = questions.find((item) => item.id === values[index]?.questionId);
          const operator = values[index]?.operator;
          const error = form.formState.errors.filters?.[index];
          const errorText = error?.questionId?.message ?? error?.operator?.message ?? error?.value?.message ?? error?.optionIds?.message;
          return <div key={field.id} style={{ marginBottom: 16 }}>
            <div className={styles.filterRow}>
              <div><label htmlFor={`${field.id}-question`} className={styles.label}>Question</label><select id={`${field.id}-question`} {...form.register(`filters.${index}.questionId`, { onChange: () => {
                form.setValue(`filters.${index}.operator`, "answered"); form.setValue(`filters.${index}.value`, ""); form.setValue(`filters.${index}.optionIds`, []);
              } })} aria-invalid={!!error?.questionId} aria-describedby={errorText ? `${field.id}-error` : undefined}>
                {questions.map((item) => <option key={item.id} value={item.id}>{item.label}{item.historical ? " (historical)" : ""}</option>)}
              </select></div>
              <div><label htmlFor={`${field.id}-operator`} className={styles.label}>Condition</label><select id={`${field.id}-operator`} {...form.register(`filters.${index}.operator`)} aria-describedby={errorText ? `${field.id}-error` : undefined}>
                <option value="answered">Answered</option><option value="unanswered">Not answered</option>
                {question && ["SHORT_TEXT", "LONG_TEXT"].includes(question.type) && <option value="contains">Contains</option>}
                {question && isChoice(question.type) && <option value="any">Matches any</option>}
                {question?.type === "YES_NO" && <><option value="yes">Yes</option><option value="no">No</option></>}
              </select></div>
              <div>{operator === "contains" && <><label htmlFor={`${field.id}-value`} className={styles.label}>Text</label><input id={`${field.id}-value`} type="text" maxLength={200} {...form.register(`filters.${index}.value`)} aria-invalid={!!error?.value} aria-describedby={errorText ? `${field.id}-error` : undefined} /></>}
                {operator === "any" && question && <fieldset className={styles.fieldset} aria-describedby={errorText ? `${field.id}-error` : undefined}><legend className={styles.label}>Any of these options</legend>{question.options.map((option) => <label className={styles.option} key={option.id}><input type="checkbox" value={option.id} {...form.register(`filters.${index}.optionIds`)} />{option.label}{question.historicalOptionIds.includes(option.id) ? " (historical)" : ""}</label>)}</fieldset>}
              </div>
              <Button variant="secondary" aria-label={`Remove filter ${index + 1}`} onClick={() => rows.remove(index)}>Remove</Button>
            </div>
            {errorText && <p id={`${field.id}-error`} className="field-error" role="alert">{errorText}</p>}
          </div>;
        })}
        <div className={styles.actions}>
          <Button variant="secondary" disabled={rows.fields.length >= Math.min(20, questions.length)} onClick={() => {
            const available = questions.find((question) => !values.some((value) => value.questionId === question.id));
            if (available) rows.append({ questionId: available.id, operator: "answered", value: "", optionIds: [] });
          }}>Add answer filter</Button>
          <Button type="submit">{pending ? "Applying filters…" : "Apply filters"}</Button>
        </div>
      </fieldset>
    </form>
  </section>;
}

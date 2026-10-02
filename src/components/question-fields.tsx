"use client";

import { useFormContext } from "react-hook-form";
import type { Question } from "@/lib/questionnaire";
import styles from "./questionnaire.module.css";

/** Native controls keep radio/checkbox semantics and keyboard behavior intact. */
export function QuestionFields({ questions, preview = false }: { questions: Question[]; preview?: boolean }) {
  const { register, formState: { errors } } = useFormContext();
  return <div className={styles.questionList}>{questions.map((question, index) => {
    const error = errors[question.id]?.message;
    const hintId = `${question.id}-hint`;
    const errorId = `${question.id}-error`;
    const describedBy = [question.helperText ? hintId : "", typeof error === "string" ? errorId : ""].filter(Boolean).join(" ") || undefined;
    const title = <>{index + 1}. {question.label} <span className={styles.meta}>{question.required ? "(required)" : "(optional)"}</span></>;
    const props = { "aria-describedby": describedBy, "aria-invalid": typeof error === "string" ? true : undefined };
    let control;
    if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
      control = <><label className={styles.label} htmlFor={question.id}>{title}</label>
        {question.type === "LONG_TEXT" ? <textarea id={question.id} rows={5} maxLength={2000} {...register(question.id)} {...props} /> : <input id={question.id} type="text" maxLength={200} {...register(question.id)} {...props} />}
        <p className={styles.meta}>Up to {question.type === "LONG_TEXT" ? "2,000" : "200"} characters.</p>
      </>;
    } else {
      const options = question.type === "YES_NO" ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : question.options;
      control = <fieldset className={styles.fieldset} aria-describedby={describedBy}>
        <legend className={styles.label}>{title}</legend>
        {question.type !== "MULTIPLE_CHOICE" && !question.required && <label className={styles.option}><input type="radio" value="" {...register(question.id)} {...props} />Not answered</label>}
        {options.map((option) => <label key={option.id} className={styles.option}><input type={question.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"} value={option.id} {...register(question.id)} {...props} />{option.label}</label>)}
        {question.type === "MULTIPLE_CHOICE" && <p className={styles.meta}>Choose all that apply.</p>}
      </fieldset>;
    }
    return <div className={styles.question} key={question.id}>
      {control}
      {question.helperText && <p className={styles.help} id={hintId}>{question.helperText}</p>}
      {!preview && typeof error === "string" && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </div>;
  })}</div>;
}

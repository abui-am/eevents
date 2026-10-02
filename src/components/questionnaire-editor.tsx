"use client";

import Link from "next/link";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TrashIcon } from "@heroicons/react/24/outline";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QUESTION_TYPES, QUESTION_TYPE_LABELS, isChoice, questionnaireSchema, type Question } from "@/lib/questionnaire";
import type { EditorState } from "@app/actions/questionnaires";
import { Button } from "./ui/button";
import styles from "./questionnaire.module.css";

type EditorValues = { questions: Question[] };
function freshQuestion(): Question {
  return { id: crypto.randomUUID(), label: "", helperText: "", type: "SHORT_TEXT", required: false, options: [] };
}

function SortableQuestion({ id, index, count, disabled, remove, children }: {
  id: string; index: number; count: number; disabled: boolean;
  remove: () => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return <section ref={setNodeRef} className={`${styles.question} ${styles.editorQuestion}`} data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Question ${index + 1}`}>
    <div className={styles.questionToolbar}>
      <button type="button" className={styles.dragHandle} ref={setActivatorNodeRef} {...attributes} {...listeners}
        disabled={disabled || count < 2} aria-label={`Reorder question ${index + 1}`} aria-describedby="question-sort-help">
        <svg width="18" height="24" viewBox="0 0 18 24" fill="currentColor" aria-hidden="true">
          {[5, 12, 19].flatMap((y) => [5, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />))}
        </svg>
      </button>
      <h2>Question {index + 1}</h2>
      <div className={styles.questionTools}>
        <button type="button" className={styles.removeQuestion} onClick={remove} disabled={disabled} aria-label={`Remove question ${index + 1}`}>
          <TrashIcon width={18} height={18} aria-hidden="true" />
        </button>
      </div>
    </div>
    {children}
  </section>;
}

function OptionsEditor({ index }: { index: number }) {
  const { control, register, formState: { errors } } = useFormContext<EditorValues>();
  const options = useFieldArray({ control, name: `questions.${index}.options`, keyName: "fieldKey" });
  const error = errors.questions?.[index]?.options?.message;
  return <div>
    <p className={styles.meta}>2–20 distinct options. Correcting a label keeps its identity; remove and add an option when its meaning changes.</p>
    {options.fields.map((option, position) => <div className={styles.optionEditor} key={option.fieldKey}>
      <div><label htmlFor={`option-${option.fieldKey}`} className={styles.meta}>Option {position + 1}</label>
        <input id={`option-${option.fieldKey}`} maxLength={100} {...register(`questions.${index}.options.${position}.label`)} aria-invalid={!!errors.questions?.[index]?.options?.[position]?.label} aria-describedby={errors.questions?.[index]?.options?.[position]?.label ? `${option.fieldKey}-error` : undefined} />
        {errors.questions?.[index]?.options?.[position]?.label?.message && <p id={`${option.fieldKey}-error`} className="field-error" role="alert">{errors.questions[index]?.options?.[position]?.label?.message}</p>}
      </div>
      <Button variant="secondary" onClick={() => options.remove(position)} aria-label={`Remove option ${position + 1}`}>Remove</Button>
    </div>)}
    {typeof error === "string" && <p className="field-error" role="alert">{error}</p>}
    <div className={styles.actions}><Button variant="secondary" disabled={options.fields.length >= 20} onClick={() => options.append({ id: crypto.randomUUID(), label: "" })}>Add option</Button></div>
  </div>;
}

export function QuestionnaireEditor({ initial, action, previewHref, publishedNumber, locked }: {
  initial: EditorState; action: (state: EditorState, data: FormData) => Promise<EditorState>;
  previewHref: string; publishedNumber: number | null; locked: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const form = useForm<EditorValues>({ resolver: zodResolver(questionnaireSchema), defaultValues: { questions: initial.questions }, mode: "onTouched", reValidateMode: "onChange", shouldFocusError: true });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "questions", keyName: "fieldKey" });
  const questions = form.watch("questions");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const { reset } = form;
  const busy = useRef(false);
  useEffect(() => { if (state.saved) reset({ questions: state.questions }); busy.current = false; }, [state, reset]);
  const version = state.versionNumber ?? publishedNumber;
  return <FormProvider {...form}>
    <p className={styles.meta}>{version ? `Published version ${version}` : "No questionnaire published"} · {form.formState.isDirty ? "Unsaved changes" : state.unpublished ? "Unpublished changes" : version ? "Published" : "Draft"}</p>
    {state.message && <p className={`${styles.notice} ${styles.success}`} role="status">{state.message}</p>}
    {state.error && <p className={`${styles.notice} ${styles.error}`} role="alert">{state.error}</p>}
    {locked && <p className={styles.notice}>Questions are read-only because this event has started or was cancelled.</p>}
    <form action={dispatch} noValidate onSubmit={(event) => {
      event.preventDefault();
      if (busy.current || locked || pending) return;
      busy.current = true;
      const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "save";
      void form.handleSubmit((values) => {
        const data = new FormData(); data.set("questions", JSON.stringify(values.questions)); data.set("revision", String(state.revision)); data.set("intent", intent);
        startTransition(() => dispatch(data));
      }, () => { busy.current = false; })(event);
    }}>
      <fieldset disabled={pending || locked} className={styles.fieldset}>
        <p className={styles.sortHelp} id="question-sort-help">Drag the grip to reorder. With a keyboard, press Space on the grip, use arrow keys, then Space to drop.</p>
        <DndContext id="question-editor-sort" sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
          if (pending || locked || !over || active.id === over.id) return;
          const from = fields.findIndex((field) => field.fieldKey === active.id);
          const to = fields.findIndex((field) => field.fieldKey === over.id);
          if (from >= 0 && to >= 0) move(from, to);
        }}>
        <SortableContext items={fields.map((field) => field.fieldKey)} strategy={verticalListSortingStrategy}>
        <div className={styles.questionList}>
          {fields.map((field, index) => {
            const error = form.formState.errors.questions?.[index];
            return <SortableQuestion key={field.fieldKey} id={field.fieldKey} index={index} count={fields.length} disabled={pending || locked} remove={() => remove(index)}>
              <div className={styles.editorGrid}>
                <div className={styles.editorField}><label htmlFor={`${field.fieldKey}-label`}>Question</label>
                  <input id={`${field.fieldKey}-label`} placeholder="What would you like to ask?" maxLength={200} {...form.register(`questions.${index}.label`)} aria-invalid={!!error?.label} aria-describedby={error?.label ? `${field.fieldKey}-label-error` : undefined} />
                  {error?.label?.message && <p className="field-error" role="alert" id={`${field.fieldKey}-label-error`}>{error.label.message}</p>}
                </div>
                <div className={styles.editorField}><label htmlFor={`${field.fieldKey}-type`}>Answer type</label>
                  <select id={`${field.fieldKey}-type`} {...form.register(`questions.${index}.type`, { onChange: (event) => {
                    form.setValue(`questions.${index}.id`, crypto.randomUUID());
                    form.setValue(`questions.${index}.options`, isChoice(event.target.value) ? [{ id: crypto.randomUUID(), label: "" }, { id: crypto.randomUUID(), label: "" }] : []);
                  } })}>{QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}</select>
                </div>
              </div>
              <div className={styles.editorField}><label htmlFor={`${field.fieldKey}-help`}>Helper text <span className={styles.meta}>(optional)</span></label><textarea id={`${field.fieldKey}-help`} rows={2} maxLength={500} {...form.register(`questions.${index}.helperText`)} /></div>
              
              {isChoice(questions[index]?.type ?? "SHORT_TEXT") && <OptionsEditor index={index} />}
              <div className={styles.questionFooter}>
                <p className={styles.meta}>Keep the same meaning when editing. For a different question, remove this one and add another.</p>
                <label className={styles.requiredToggle}><input type="checkbox" {...form.register(`questions.${index}.required`)} /><span aria-hidden="true" className={styles.switchTrack} />Required</label>
              </div>
            </SortableQuestion>;
          })}
        </div>
        </SortableContext>
        </DndContext>
        {!fields.length && <div className={styles.panel}><h2>No questions yet</h2><p className={styles.help}>Ask about experience, goals, or preferences to help review applications.</p></div>}
        <div className={styles.actions}><Button variant="secondary" disabled={fields.length >= 20} onClick={() => append(freshQuestion())}>Add question</Button><span className={styles.meta}>{fields.length} / 20 questions</span></div>
        {form.formState.errors.questions?.message && <p className="field-error" role="alert">{form.formState.errors.questions.message}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" type="submit" name="intent" value="save" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button>
          <Button type="submit" name="intent" value="publish" disabled={pending}>{pending ? "Saving…" : "Publish questions"}</Button>
        </div>
      </fieldset>
      <div className={styles.actions}><Link className={styles.back} href={previewHref}>Preview saved draft</Link></div>
      <p className={styles.help}>Publishing affects future applications. Earlier applications keep their original questions and answers. Save your draft before previewing it.</p>
    </form>
  </FormProvider>;
}

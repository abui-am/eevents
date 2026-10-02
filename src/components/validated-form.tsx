"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formSchemas, type FormSchemaName } from "@/lib/form-schemas";
import { createEventInputSchema } from "@/lib/validation";
import { formatZonedInput, type ScheduleReference } from "@/lib/zoned-schedule";
import { useViewerTimeZone } from "./viewer-time-zone";
import { Button, type ButtonVariant } from "./ui/button";

const NativeSubmissionContext = createContext(false);

function SubmissionStatus({ busy }: { busy: RefObject<boolean> }) {
  const { pending } = useFormStatus();
  useEffect(() => { busy.current = pending; }, [busy, pending]);
  return null;
}

type ValidatedFormProps = Omit<ComponentProps<"form">, "action" | "onSubmit" | "defaultValue"> & {
  action: string | ((data: FormData) => void | Promise<void>);
  schema: FormSchemaName;
  defaults: Record<string, string>;
  scheduleReference?: ScheduleReference;
  preservedTimeZone?: string;
};

/** Validate before handing submission to React's native server-action lifecycle. */
export function ValidatedForm({ action, schema, defaults, scheduleReference, preservedTimeZone, children, ...props }: ValidatedFormProps) {
  const viewer = useViewerTimeZone();
  const resolverSchema = useMemo(() => schema === "event" ? createEventInputSchema(scheduleReference) : formSchemas[schema], [schema, scheduleReference]);
  const form = useForm({
    resolver: zodResolver(resolverSchema, undefined, { raw: true }),
    defaultValues: defaults,
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });
  const { reset, setValue, formState: { dirtyFields } } = form;
  const initializedZone = useRef(false);
  // A server redirect can replace preserved values without remounting this form.
  useEffect(() => { reset(defaults); initializedZone.current = false; }, [defaults, reset]);
  useEffect(() => {
    if (schema !== "event" || !viewer.ready || initializedZone.current) return;
    initializedZone.current = true;
    if (preservedTimeZone !== undefined || dirtyFields.startsAt || dirtyFields.endsAt || dirtyFields.timeZone) return;
    setValue("timeZone", viewer.timeZone);
    if (scheduleReference) {
      setValue("startsAt", formatZonedInput(scheduleReference.startsAt, viewer.timeZone));
      setValue("endsAt", formatZonedInput(scheduleReference.endsAt, viewer.timeZone));
    }
  }, [schema, viewer.ready, viewer.timeZone, defaults, scheduleReference, preservedTimeZone, dirtyFields, setValue]);
  const validated = useRef(false);
  const validating = useRef(false);
  const busy = useRef(false);
  const [nativePending, setNativePending] = useState(false);

  return (
    <NativeSubmissionContext value={nativePending}>
    <FormProvider {...form}>
      <form {...props} action={action} noValidate onSubmit={(event) => {
        if (busy.current) {
          event.preventDefault();
          return;
        }
        if (validated.current) {
          validated.current = false;
          busy.current = true;
          if (typeof action === "string") setNativePending(true);
          return;
        }
        event.preventDefault();
        if (validating.current) return;
        const element = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        validating.current = true;
        void form.handleSubmit(() => {
          validated.current = true;
          // A real browser ignores recursive requestSubmit during its submit
          // algorithm. Start a new task and preserve the original submitter.
          setTimeout(() => {
            if (!element.isConnected) { validated.current = false; return; }
            element.requestSubmit(submitter ?? undefined);
          }, 0);
        })(event).finally(() => { validating.current = false; });
      }}>
        {typeof action === "function" ? <SubmissionStatus busy={busy} /> : null}
        {children}
      </form>
    </FormProvider>
    </NativeSubmissionContext>
  );
}

type FieldProps = ComponentProps<"input"> & { name: string };

export function ValidatedInput(props: FieldProps) {
  const { register, formState: { errors } } = useFormContext();
  const { pending: actionPending } = useFormStatus();
  const pending = useContext(NativeSubmissionContext) || actionPending;
  const error = errors[props.name]?.message;
  const errorId = `${props.id ?? props.name}-field-error`;
  return (
    <>
      <input {...props} {...register(props.name)} readOnly={props.type !== "file" && (props.readOnly || pending)}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={[props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined} />
      {typeof error === "string" ? <p className="field-error" id={errorId} role="alert">{error}</p> : null}
    </>
  );
}

export function ValidatedTextarea(props: ComponentProps<"textarea"> & { name: string }) {
  const { register, formState: { errors } } = useFormContext();
  const { pending: actionPending } = useFormStatus();
  const pending = useContext(NativeSubmissionContext) || actionPending;
  const error = errors[props.name]?.message;
  const errorId = `${props.id ?? props.name}-field-error`;
  return <>
    <textarea {...props} {...register(props.name)} readOnly={props.readOnly || pending}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined} />
    {typeof error === "string" ? <p className="field-error" id={errorId} role="alert">{error}</p> : null}
  </>;
}

export function ValidatedSelect(props: ComponentProps<"select"> & { name: string }) {
  const { register, formState: { errors } } = useFormContext();
  const { pending: actionPending } = useFormStatus();
  const pending = useContext(NativeSubmissionContext) || actionPending;
  const error = errors[props.name]?.message;
  const errorId = `${props.id ?? props.name}-field-error`;
  return <>
    <select {...props} {...register(props.name, { onChange: props.onChange })} disabled={props.disabled || pending} aria-invalid={error ? true : undefined}
      aria-describedby={[props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined} />
    {typeof error === "string" ? <p className="field-error" id={errorId} role="alert">{error}</p> : null}
  </>;
}

export function SubmitButton({ children, pendingLabel = "Saving…", disabled, ...props }: ComponentProps<"button"> & { pendingLabel?: string; children: ReactNode; variant?: ButtonVariant }) {
  const { pending: actionPending } = useFormStatus();
  const pending = useContext(NativeSubmissionContext) || actionPending;
  return <Button {...props} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
    {pending ? pendingLabel : children}
  </Button>;
}

"use client";

import { useState, type ChangeEvent } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { formatZonedInput, localDateTimeToDate, type ScheduleReference } from "@/lib/zoned-schedule";
import DatePicker from "react-datepicker";
import { ValidatedSelect } from "./validated-form";
import { useViewerTimeZone } from "./viewer-time-zone";
import styles from "@app/admin/admin.module.css";

function PickerTimeInput({ value = "", onChange, label }: { value?: string; onChange?: (value: string) => void; label: string }) {
  return <input type="time" aria-label={label} value={value} onChange={(event) => onChange?.(event.target.value)} />;
}

function SchedulePicker({ name, locked, timeZone, reference }: { name: "startsAt" | "endsAt"; locked: boolean; timeZone: string; reference?: string }) {
  const { field, fieldState } = useController({ name });
  const { formState } = useFormContext();
  const value: string = field.value ?? "";
  let selected: Date | null = null;
  try { if (value) selected = localDateTimeToDate(value, timeZone, reference); } catch { /* Keep invalid civil times visible for validation. */ }
  const errorId = `${name}-field-error`;
  return <>
    <input type="hidden" name={name} value={value} />
    <DatePicker ref={(picker) => field.ref(picker?.input ?? null)} id={name} selected={selected} timeZone={timeZone}
      value={value.replace("T", " ")} dateFormat="yyyy-MM-dd HH:mm"
      showTimeInput timeInputLabel="Time" customTimeInput={<PickerTimeInput label={`${name === "startsAt" ? "Start" : "End"} time (${timeZone})`} />} placeholderText="YYYY-MM-DD HH:mm"
      readOnly={locked} disabled={formState.isSubmitting} required
      ariaDescribedBy={`schedule-timezone-help${fieldState.error ? ` ${errorId}` : ""}`}
      ariaInvalid={fieldState.invalid ? "true" : undefined}
      onBlur={field.onBlur}
      customInput={<input />}
      onChange={(date: Date | null) => field.onChange(date ? formatZonedInput(date, timeZone) : "")}
      onChangeRaw={(event, meta) => {
        if (meta || !event || !(event.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        field.onChange(event.target.value.replace(" ", "T"));
      }} />
    {fieldState.error?.message ? <p className="field-error" id={errorId} role="alert">{fieldState.error.message}</p> : null}
  </>;
}

export function ScheduleFields({ locked = false, reference }: { locked?: boolean; reference?: ScheduleReference }) {
  const viewer = useViewerTimeZone();
  const { getValues, setValue } = useFormContext();
  const timeZone: string = useWatch({ name: "timeZone" }) ?? "UTC";
  const [notice, setNotice] = useState<string | null>(null);
  const zones = Array.from(new Set([viewer.timeZone, timeZone, "UTC"]));

  function changeTimeZone(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    let needsReview = false;
    for (const field of ["startsAt", "endsAt"] as const) {
      const current = getValues(field);
      if (!current) continue;
      try {
        const instant = localDateTimeToDate(current, timeZone, reference?.[field]);
        setValue(field, formatZonedInput(instant, next), { shouldDirty: true, shouldValidate: true });
      } catch {
        needsReview = true;
      }
    }
    setNotice(needsReview ? "Some entered times could not be converted. Check them in the selected timezone before saving." : null);
  }

  return <>
    <div className={styles.field}>
      <label htmlFor="timeZone">Schedule timezone</label>
      <ValidatedSelect id="timeZone" name="timeZone" defaultValue={timeZone} onChange={changeTimeZone} aria-describedby="schedule-timezone-help">
        {zones.map((zone) => <option key={zone} value={zone}>{zone === "UTC" ? "UTC" : `${zone}${zone === viewer.timeZone ? " — device time" : ""}`}</option>)}
      </ValidatedSelect>
      <p className={styles.fieldHint} id="schedule-timezone-help">Times are entered in {timeZone}. Participants see the schedule in their own timezone.</p>
      {notice ? <p className={styles.fieldHint} role="status">{notice}</p> : null}
    </div>
    <div className={styles.twoColumns}>
      <div className={styles.field}>
        <label htmlFor="startsAt">Starts at ({timeZone}) (required)</label>
        <SchedulePicker name="startsAt" locked={locked} timeZone={timeZone} reference={reference?.startsAt} />
      </div>
      <div className={styles.field}>
        <label htmlFor="endsAt">Ends at ({timeZone}) (required)</label>
        <SchedulePicker name="endsAt" locked={locked} timeZone={timeZone} reference={reference?.endsAt} />
      </div>
    </div>
  </>;
}

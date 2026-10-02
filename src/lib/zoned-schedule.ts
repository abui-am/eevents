import { Temporal } from "@js-temporal/polyfill";

export type ScheduleReference = { startsAt: string; endsAt: string };

export function formatZonedInput(instant: string | Date, timeZone: string): string {
  const iso = instant instanceof Date ? instant.toISOString() : instant;
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone)
    .toPlainDateTime().toString({ smallestUnit: "minute" });
}

/** A trusted reference preserves an untouched field, including a repeated DST hour. */
export function localDateTimeToDate(value: string, timeZone: string, reference?: string): Date {
  if (reference && formatZonedInput(reference, timeZone) === value) return new Date(reference);
  const local = Temporal.PlainDateTime.from(value, { overflow: "reject" });
  return new Date(local.toZonedDateTime(timeZone, { disambiguation: "reject" }).epochMilliseconds);
}

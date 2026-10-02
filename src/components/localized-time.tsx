"use client";

import { formatZonedDate, formatZonedSchedule, formatZonedTimestamp } from "@/lib/time-zone";
import { useViewerTimeZone } from "./viewer-time-zone";
import styles from "./event-summary.module.css";

export function LocalizedTimestamp({ value, compact = false, className }: {
  value: string; compact?: boolean; className?: string;
}) {
  const { timeZone } = useViewerTimeZone();
  return <time dateTime={value} className={className}>{formatZonedTimestamp(new Date(value), timeZone, compact)}</time>;
}

export function LocalizedSchedule({ start, end, compact = false }: {
  start: string; end: string; compact?: boolean;
}) {
  const { timeZone } = useViewerTimeZone();
  return <time dateTime={start}>{formatZonedSchedule(new Date(start), new Date(end), timeZone, compact)}</time>;
}

export function ViewerTimeZoneNote() {
  const { timeZone } = useViewerTimeZone();
  return <span>Times shown in {timeZone}</span>;
}

export function ArrivalState({ value }: { value: string | null }) {
  return value ? <>Arrival recorded <LocalizedTimestamp value={value} compact /></> : <>No arrival recorded</>;
}

export function LocalizedDateTile({ value, size }: { value: string; size: "row" | "detail" }) {
  const { timeZone } = useViewerTimeZone();
  const date = new Date(value);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
  return <time className={styles.fallback} dateTime={value} aria-label={formatZonedDate(date, timeZone)}>
    {size === "detail" ? <>
      <span className={styles.weekday}>{part({ weekday: "long" })}</span>
      <span className={styles.detailDay}>{part({ day: "numeric" })}</span>
      <span className={styles.monthYear}>{part({ month: "long", year: "numeric" })}</span>
    </> : <>
      <span className={styles.month}>{part({ month: "short" })}</span>
      <span className={styles.day}>{part({ day: "numeric" })}</span>
    </>}
  </time>;
}

/** Display helpers use Intl only; schedule input conversion lives separately. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 100 || /^[+-]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function timeZoneLabel(timeZone: string, date = new Date()): string {
  if (timeZone === "UTC") return "UTC";
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
  return `${timeZone} (${offset?.replace("GMT", "UTC") ?? "UTC"})`;
}

export function formatZonedDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone,
  }).format(date);
}

function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
  }).format(date);
}

export function formatZonedTimestamp(date: Date, timeZone: string, compact = false): string {
  const day = compact
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date)
    : formatZonedDate(date, timeZone);
  return `${day} at ${formatClock(date, timeZone)} ${timeZoneLabel(timeZone, date)}`;
}

export function formatZonedSchedule(start: Date, end: Date, timeZone: string, compact = false): string {
  const day = (date: Date) => compact
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date)
    : formatZonedDate(date, timeZone);
  const startDay = day(start);
  const endDay = day(end);
  const startZone = timeZoneLabel(timeZone, start);
  const endZone = timeZoneLabel(timeZone, end);
  if (startZone !== endZone) {
    return `${startDay}, ${formatClock(start, timeZone)} ${startZone} to ${endDay}, ${formatClock(end, timeZone)} ${endZone}`;
  }
  return `${startDay}, ${formatClock(start, timeZone)} to ${startDay === endDay ? "" : `${endDay}, `}${formatClock(end, timeZone)} ${startZone}`;
}

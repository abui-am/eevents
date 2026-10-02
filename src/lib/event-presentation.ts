const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

export function formatUtcDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatUtcTimestamp(date: Date): string {
  return `${formatUtcDate(date)} at ${timeFormatter.format(date)} UTC`;
}

export function formatUtcSchedule(start: Date, end: Date): string {
  const startDate = formatUtcDate(start);
  const endDate = formatUtcDate(end);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);

  if (startDate === endDate) {
    return `${startDate}, ${startTime} to ${endTime} UTC`;
  }

  return `${startDate}, ${startTime} to ${endDate}, ${endTime} UTC`;
}

export function getAvailability(
  capacity: number,
  activeRegistrationCount: number,
  startsAt: Date,
  now = new Date(),
): { label: string; isFull: boolean; isClosed: boolean } {
  if (startsAt <= now) {
    return { label: "Registration closed", isFull: false, isClosed: true };
  }

  if (activeRegistrationCount >= capacity) {
    return { label: "Event full", isFull: true, isClosed: false };
  }

  const remaining = Math.max(0, capacity - activeRegistrationCount);
  return {
    label: `${remaining} ${remaining === 1 ? "place" : "places"} left`,
    isFull: false,
    isClosed: false,
  };
}

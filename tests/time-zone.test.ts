import { describe, expect, it } from "vitest";
import { formatZonedDate, formatZonedSchedule, formatZonedTimestamp, isValidTimeZone } from "@/lib/time-zone";
import { formatZonedInput, localDateTimeToDate } from "@/lib/zoned-schedule";
import { eventInputSchema } from "@/lib/validation";
import { saveAdminEvent } from "@/services/admin-event-service";
import { db } from "@/lib/db";
import { createTestEvent, createTestUser } from "./support/database";

const details = {
  title: "Local time workshop", description: "A workshop in Bali.", location: "Bali", capacity: "10", status: "PUBLISHED",
  startsAt: "2031-03-03T17:00", endsAt: "2031-03-03T20:00", timeZone: "Asia/Makassar",
};

describe("viewer timezone and schedule conversion", () => {
  it("shows Bali time, local date rollover, and fractional offsets", () => {
    const start = new Date("2031-03-03T09:00:00Z");
    expect(formatZonedSchedule(start, new Date("2031-03-03T12:00:00Z"), "Asia/Makassar")).toContain("17:00 to 20:00 Asia/Makassar (UTC+08:00)");
    expect(formatZonedTimestamp(new Date("2026-10-02T17:03:00Z"), "Asia/Makassar")).toBe("Saturday, 3 October 2026 at 01:03 Asia/Makassar (UTC+08:00)");
    expect(formatZonedDate(new Date("2031-03-03T23:00:00Z"), "Asia/Makassar")).toContain("4 March");
    expect(formatZonedInput(start, "Asia/Kathmandu")).toBe("2031-03-03T14:45");
    expect(localDateTimeToDate("2031-03-03T14:45", "Asia/Kathmandu").toISOString()).toBe(start.toISOString());
  });

  it("rejects invalid zones and skipped/repeated local times without shifting them", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("+08:00")).toBe(false);
    expect(eventInputSchema.safeParse({ ...details, timeZone: "Not/AZone" }).success).toBe(false);
    expect(() => localDateTimeToDate("2030-03-10T02:30", "America/New_York")).toThrow();
    expect(() => localDateTimeToDate("2030-11-03T01:30", "America/New_York")).toThrow();
    const range = formatZonedSchedule(new Date("2030-11-03T05:30:00Z"), new Date("2030-11-03T06:30:00Z"), "America/New_York");
    expect(range).toContain("UTC-04:00");
    expect(range).toContain("UTC-05:00");
  });

  it("stores local form times as UTC and supports old UTC callers", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const saved = await saveAdminEvent(admin.id, null, details);
    const event = await db.event.findUniqueOrThrow({ where: { id: saved.id } });
    expect(event.startsAt.toISOString()).toBe("2031-03-03T09:00:00.000Z");
    expect(event.endsAt.toISOString()).toBe("2031-03-03T12:00:00.000Z");
    expect(formatZonedInput(event.startsAt, "Asia/Makassar")).toBe(details.startsAt);
    const parsed = eventInputSchema.parse({ ...details, timeZone: undefined });
    expect(parsed.timeZone).toBe("UTC");
    expect(parsed.startsAt.toISOString()).toBe("2031-03-03T17:00:00.000Z");
  });

  it("preserves untouched instants and precision during locked or ambiguous-hour edits", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const start = new Date("2020-11-01T06:30:42.123Z");
    const end = new Date("2020-11-01T07:30:42.123Z");
    const event = await createTestEvent(admin.id, { startsAt: start, endsAt: end });
    await saveAdminEvent(admin.id, event.id, {
      ...details, startsAt: formatZonedInput(start, "America/New_York"), endsAt: formatZonedInput(end, "America/New_York"), timeZone: "America/New_York",
    });
    const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.startsAt.toISOString()).toBe(start.toISOString());
    expect(updated.endsAt.toISOString()).toBe(end.toISOString());
    await expect(saveAdminEvent(admin.id, event.id, { ...details })).rejects.toMatchObject({ code: "schedule_locked" });
  });
});

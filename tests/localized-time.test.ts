// @vitest-environment jsdom
import { createElement as h, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ViewerTimeZoneProvider } from "@/components/viewer-time-zone";
import { LocalizedDateTile, LocalizedSchedule } from "@/components/localized-time";
import { ScheduleFields } from "@/components/schedule-fields";
import { SubmitButton, ValidatedForm } from "@/components/validated-form";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function detectBali() {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...original.call(this), timeZone: "Asia/Makassar" };
  });
}

const reference = { startsAt: "2031-03-03T09:00:00.000Z", endsAt: "2031-03-03T12:00:00.000Z" };
const defaults = { title: "Local workshop", description: "Details", location: "Bali", capacity: "10", status: "DRAFT", timeZone: "UTC", startsAt: "2031-03-03T09:00", endsAt: "2031-03-03T12:00" };

function form(action: (data: FormData) => Promise<void>, returned?: typeof defaults) {
  return h(ViewerTimeZoneProvider, null, h(ValidatedForm, {
    schema: "event", defaults: returned ?? defaults, action, scheduleReference: reference,
    preservedTimeZone: returned?.timeZone,
    children: h(Fragment, null,
      ...["title", "description", "location", "capacity", "status"].map((name) => h("input", { key: name, type: "hidden", name, defaultValue: defaults[name as keyof typeof defaults] })),
      h(ScheduleFields, { reference }),
      h(SubmitButton, { children: "Save event" }),
    ),
  }));
}

it("renders the same UTC fallback on the server, then detects local time and local date tiles", async () => {
  detectBali();
  const content = h(ViewerTimeZoneProvider, null, h(Fragment, null,
    h(LocalizedSchedule, { start: reference.startsAt, end: reference.endsAt }),
    h(LocalizedDateTile, { value: "2031-03-03T23:00:00.000Z", size: "row" }),
  ));
  expect(renderToString(content)).toContain("09:00 to 12:00 UTC");
  render(content);
  await waitFor(() => expect(screen.getByText(/17:00 to 20:00 Asia\/Makassar/)).toBeTruthy());
  expect(screen.getByLabelText("Tuesday, 4 March 2031").textContent).toBe("Mar4");
});

it("populates local event fields, preserves instants when choosing UTC, and submits the zone", async () => {
  detectBali();
  const user = userEvent.setup();
  const action = vi.fn(async (data: FormData) => { expect(data.get("title")).toBe("Local workshop"); });
  render(form(action));
  await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/Starts at/).value).toBe("2031-03-03 17:00"));
  expect(screen.getByLabelText<HTMLInputElement>(/Ends at/).value).toBe("2031-03-03 20:00");
  await user.selectOptions(screen.getByLabelText("Schedule timezone"), "UTC");
  expect(screen.getByLabelText<HTMLInputElement>(/Starts at/).value).toBe("2031-03-03 09:00");
  await user.click(screen.getByRole("button", { name: "Save event" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0][0].get("timeZone")).toBe("UTC");
  expect(action.mock.calls[0][0].get("startsAt")).toBe("2031-03-03T09:00");
});

it("retains returned local values and timezone instead of applying device conversion again", async () => {
  detectBali();
  render(form(vi.fn(), { ...defaults, timeZone: "Asia/Kathmandu", startsAt: "2031-03-03T14:45", endsAt: "2031-03-03T17:45" }));
  await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>("Schedule timezone").value).toBe("Asia/Kathmandu"));
  expect(screen.getByLabelText<HTMLInputElement>(/Starts at/).value).toBe("2031-03-03 14:45");
});

it("keeps typed civil times for validation and focuses an invalid date field", async () => {
  detectBali();
  const user = userEvent.setup();
  const action = vi.fn();
  render(form(action));
  const start = screen.getByLabelText<HTMLInputElement>(/Starts at/);
  await waitFor(() => expect(start.value).toBe("2031-03-03 17:00"));
  await user.clear(start);
  await user.type(start, "2031-02-30 17:00");
  await user.click(screen.getByRole("button", { name: "Save event" }));
  await waitFor(() => expect(start.getAttribute("aria-invalid")).toBe("true"));
  expect(document.activeElement).toBe(start);
  expect(action).not.toHaveBeenCalled();
});

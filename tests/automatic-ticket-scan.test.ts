// @vitest-environment jsdom
import { createElement as h, StrictMode } from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AutomaticTicketScan } from "@/components/automatic-ticket-scan";

const mocks = vi.hoisted(() => ({ scan: vi.fn(), replace: vi.fn() }));
vi.mock("@app/actions/check-in", () => ({ scanTicketAction: mocks.scan }));
vi.mock("next/navigation", () => { const router = { replace: mocks.replace }; return { useRouter: () => router }; });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("automatically posts once under Strict Mode and opens the attendance result", async () => {
  mocks.scan.mockResolvedValue({ href: "/admin/events/event/check-in?result=arrived" });
  render(h(StrictMode, null, h(AutomaticTicketScan, { eventId: "event", ticket: "signed-ticket" })));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/events/event/check-in?result=arrived"));
  expect(mocks.scan).toHaveBeenCalledTimes(1);
  expect(mocks.scan).toHaveBeenCalledWith("event", "signed-ticket");
});

it("announces server failure and retries only when requested", async () => {
  mocks.scan.mockResolvedValueOnce({ error: "No arrival was recorded." }).mockResolvedValueOnce({ href: "/admin/events/event/check-in?result=certified" });
  render(h(AutomaticTicketScan, { eventId: "event", ticket: "signed-ticket" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No arrival");
  expect(mocks.replace).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Retry scan" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/events/event/check-in?result=certified"));
  expect(mocks.scan).toHaveBeenCalledTimes(2);
});

it("shows pending feedback and does not navigate after unmount", async () => {
  let resolve: ((value: { href: string }) => void) | undefined;
  mocks.scan.mockImplementation(() => new Promise<{ href: string }>((done) => { resolve = done; }));
  const view = render(h(AutomaticTicketScan, { eventId: "event", ticket: "signed-ticket" }));
  expect(screen.getByRole("status").textContent).toContain("Recording onsite scan");
  view.unmount();
  await act(async () => resolve?.({ href: "/admin/events/event/check-in" }));
  expect(mocks.replace).not.toHaveBeenCalled();
});

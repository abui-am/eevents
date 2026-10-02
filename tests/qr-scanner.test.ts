// @vitest-environment jsdom
import { createElement as h } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { scannedTicketReference } from "@/lib/scanned-ticket";
import { QrCheckInScanner } from "@/components/qr-check-in-scanner";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), review: vi.fn(), start: vi.fn(), stop: vi.fn(), destroy: vi.fn(),
  options: undefined as undefined | { preferredCamera: string; calculateScanRegion: (video: HTMLVideoElement) => { x: number; y: number; width: number; height: number; downScaledWidth: number; downScaledHeight: number }; onDecodeError: (error: string) => void },
  decode: undefined as undefined | ((result: { data: string }) => void),
}));
vi.mock("next/navigation", () => { const router = { push: mocks.push }; return { useRouter: () => router }; });
vi.mock("@app/actions/check-in", () => ({ scanTicketAction: mocks.review }));
vi.mock("qr-scanner", () => ({ default: class {
  static NO_QR_CODE_FOUND = "No QR code found";
  constructor(_video: HTMLVideoElement, decode: typeof mocks.decode, options: typeof mocks.options) { mocks.decode = decode; mocks.options = options; }
  start = mocks.start;
  stop = mocks.stop;
  destroy = mocks.destroy;
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("rejects foreign origins, cross-event links, and ambiguous QR parameters", () => {
  const valid = "http://localhost:3000/admin/events/event/check-in?ticket=v1.ticket";
  expect(scannedTicketReference(valid, "event", "http://localhost:3000")).toBe("v1.ticket");
  for (const raw of [valid.replace("localhost:3000", "evil.test"), valid.replace("/event/", "/other/"), `${valid}&ticket=other`, `${valid}&next=https://evil.test`, `${valid}#fragment`, "javascript:alert(1)"]) {
    expect(scannedTicketReference(raw, "event", "http://localhost:3000")).toBeNull();
  }
});

it("starts only on request, validates once for repeated scans, and releases the camera", async () => {
  mocks.start.mockResolvedValue(undefined);
  mocks.review.mockResolvedValue({ href: "/admin/events/event/check-in?ticket=valid" });
  const view = render(h(QrCheckInScanner, { eventId: "event" }));
  expect(mocks.start).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  const data = `${window.location.origin}/admin/events/event/check-in?ticket=valid`;
  await act(async () => { mocks.decode?.({ data }); mocks.decode?.({ data }); });
  expect(mocks.review).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith("/admin/events/event/check-in?ticket=valid");
  expect(mocks.stop).toHaveBeenCalled();
  view.unmount();
  expect(mocks.destroy).toHaveBeenCalled();
});

it("shows a recoverable camera error and lets the admin retry", async () => {
  mocks.start.mockRejectedValueOnce(new Error("Permission denied"));
  render(h(QrCheckInScanner, { eventId: "event" }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Allow camera access"));
  expect(screen.getByRole("button", { name: "Scan QR code" })).toBeDefined();
  expect(mocks.review).not.toHaveBeenCalled();
});

it("keeps foreign-event QR codes out of server review and handles revoked tickets without navigating", async () => {
  mocks.start.mockResolvedValue(undefined);
  mocks.review.mockResolvedValue({ error: "This ticket is no longer eligible." });
  render(h(QrCheckInScanner, { eventId: "event" }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  await act(async () => { mocks.decode?.({ data: `${window.location.origin}/admin/events/other/check-in?ticket=valid` }); });
  expect(mocks.review).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("not a ticket for this event");
  await act(async () => { mocks.decode?.({ data: `${window.location.origin}/admin/events/event/check-in?ticket=revoked` }); });
  expect(screen.getByRole("alert").textContent).toContain("no longer eligible");
  expect(mocks.push).not.toHaveBeenCalled();
});

it("releases a camera whose permission request finishes after leaving the page", async () => {
  let grant: (() => void) | undefined;
  mocks.start.mockImplementationOnce(() => new Promise<void>((resolve) => { grant = resolve; }));
  const view = render(h(QrCheckInScanner, { eventId: "event" }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
  await act(async () => { grant?.(); });
  expect(mocks.destroy).toHaveBeenCalledTimes(2);
  expect(mocks.push).not.toHaveBeenCalled();
});


it("scans the complete frame at sufficient resolution and reports decoder failures", async () => {
  mocks.start.mockResolvedValue(undefined);
  render(h(QrCheckInScanner, { eventId: "event" }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.options).toBeDefined());
  const camera = document.createElement("video");
  Object.defineProperties(camera, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
  expect(mocks.options?.calculateScanRegion(camera)).toEqual({ x: 0, y: 0, width: 1920, height: 1080, downScaledWidth: 960, downScaledHeight: 540 });
  await act(async () => { mocks.options?.onDecodeError("No QR code found"); });
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { mocks.options?.onDecodeError("Worker failed"); });
  expect(screen.getByRole("alert").textContent).toContain("could not process");
});

it("switches cameras and lets the user cancel an opening camera", async () => {
  mocks.start.mockResolvedValue(undefined);
  render(h(QrCheckInScanner, { eventId: "event" }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.options?.preferredCamera).toBe("environment"));
  await userEvent.click(screen.getByRole("button", { name: "Switch camera" }));
  await waitFor(() => expect(mocks.options?.preferredCamera).toBe("user"));
  expect(mocks.destroy).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Stop scanning" }));
  let finish: (() => void) | undefined;
  mocks.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
  await userEvent.click(screen.getByRole("button", { name: "Stop scanning" }));
  await act(async () => { finish?.(); });
  expect(screen.getByRole("button", { name: "Scan QR code" })).toBeTruthy();
  expect(mocks.review).not.toHaveBeenCalled();
});

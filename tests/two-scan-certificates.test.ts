import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { GET as openCertificate } from "@app/certificates/[token]/route";
import { scanTicketAction } from "@app/actions/check-in";
import { db } from "@/lib/db";
import { createTicketReference } from "@/lib/check-in-tickets";
import { renderCertificate } from "@/lib/html-certificate";
import { confirmQrCheckIn, manuallyCheckIn, getCheckInReview } from "@/services/check-in-service";
import { applyToEvent, cancelOwnRegistration } from "@/services/registration-service";
import { setAdminRegistrationStatus } from "@/services/admin-event-service";
import { createTestEvent, createTestUser, createTestSession } from "./support/database";

const start = new Date("2030-04-05T10:00:00Z");
const end = new Date("2030-04-05T12:00:00Z");
async function fixture() {
  const admin = await createTestUser({ role: "ADMIN", name: "Workshop Organizer" });
  const user = await createTestUser({ name: "Ada Participant" });
  const event = await createTestEvent(admin.id, { startsAt: start, endsAt: end, title: "Practical Engineering" });
  const registration = await db.registration.create({ data: { userId: user.id, eventId: event.id, checkInTicketVersion: randomUUID() } });
  const ticket = createTicketReference({ eventId: event.id, registrationId: registration.id, ticketVersion: registration.checkInTicketVersion! });
  return { admin, user, event, registration, ticket };
}

it("confirms a pending participant on arrival and issues only after an end scan", async () => {
  const f = await fixture();
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, start)).toMatchObject({ outcome: "arrived", certificateHref: null });
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ status: "ATTENDED", checkedInAt: start, endPresenceAt: null });
  expect(await db.certificate.count()).toBe(0);
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, new Date(end.getTime() - 1))).toMatchObject({ outcome: "already-arrived", certificateHref: null });
  const result = await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, end);
  expect(result).toMatchObject({ outcome: "certified", certificateHref: expect.stringMatching(/^\/certificates\/[A-Za-z0-9_-]{43}$/) });
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ endPresenceAt: end, endPresenceById: f.admin.id });
});

it("records arrivals days before the event and issues certificates days after it", async () => {
  const f = await fixture();
  const early = new Date(start.getTime() - 7 * 24 * 3_600_000);
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, early)).toMatchObject({ outcome: "arrived", certificateHref: null });
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ checkedInAt: early, endPresenceAt: null });
  expect(await db.certificate.count()).toBe(0);
  const late = new Date(end.getTime() + 7 * 24 * 3_600_000);
  expect(await getCheckInReview(f.event.id, f.ticket, late)).toMatchObject({ canCheckIn: true, phase: "final", unavailableReason: null });
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, late)).toMatchObject({ outcome: "certified" });
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, new Date(end.getTime() + 30 * 24 * 3_600_000))).toMatchObject({ outcome: "already-certified" });
});

it("records a first late scan as arrival and issues only on the following scan", async () => {
  const f = await fixture();
  const late = new Date(end.getTime() + 7 * 24 * 3_600_000);
  await db.registration.update({ where: { id: f.registration.id }, data: { status: "ATTENDED" } });
  expect(await getCheckInReview(f.event.id, f.ticket, late)).toMatchObject({ canCheckIn: true, phase: "arrival" });
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, late)).toMatchObject({ outcome: "arrived", certificateHref: null });
  expect(await db.certificate.count()).toBe(0);
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ checkedInAt: late, endPresenceAt: null });
  expect(await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, new Date(late.getTime() + 1))).toMatchObject({ outcome: "certified" });
  expect(await db.certificate.count()).toBe(1);
});

it("retains the first end scan actor, certificate and URL under concurrent scans", async () => {
  const f = await fixture();
  const other = await createTestUser({ role: "ADMIN" });
  await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, start);
  const results = await Promise.all([
    confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, end),
    confirmQrCheckIn(other.id, f.event.id, f.ticket, new Date(end.getTime() + 1_000)),
  ]);
  expect(results.map((result) => result.outcome).sort()).toEqual(["already-certified", "certified"]);
  expect(results[0].certificateHref).toBe(results[1].certificateHref);
  const original = await db.registration.findUniqueOrThrow({ where: { id: f.registration.id }, include: { certificate: true } });
  await confirmQrCheckIn(other.id, f.event.id, f.ticket, new Date(end.getTime() + 2_000));
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id }, include: { certificate: true } })).toEqual(original);
  expect(await db.certificate.count()).toBe(1);
});

it("opens persistent HTML without login, freezes content and survives event cancellation", async () => {
  const f = await fixture();
  await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, start);
  await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, end);
  const certificate = await db.certificate.findUniqueOrThrow({ where: { registrationId: f.registration.id } });
  await db.user.update({ where: { id: f.user.id }, data: { name: "Changed Name" } });
  await db.event.update({ where: { id: f.event.id }, data: { title: "Changed Event", status: "CANCELLED" } });
  await db.$disconnect();
  const response = await openCertificate(new Request("https://eevents.example/certificates/token"), { params: Promise.resolve({ token: certificate.token }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const html = await response.text();
  expect(html).toBe(certificate.html);
  expect(html).toContain("Ada Participant");
  expect(html).toContain("Practical Engineering");
  expect(html).not.toContain(f.user.email);
  expect(html).not.toContain("Changed Name");
});

it("returns 404 for unknown and malformed certificate links", async () => {
  for (const token of ["bad", "x".repeat(43), "../secret"]) {
    expect((await openCertificate(new Request("https://eevents.example"), { params: Promise.resolve({ token }) })).status).toBe(404);
  }
});

it("escapes all personalized certificate values and includes print layout", () => {
  const html = renderCertificate({ id: '<script>alert("id")</script>', participantName: '<img src=x onerror="bad">', eventTitle: "<script>bad</script>", organizerName: 'A&B "Host"', startsAt: start, endsAt: end, issuedAt: end });
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
  expect(html).toContain("A&amp;B &quot;Host&quot;");
  expect(html).toContain("@media print");
  expect(html).toContain("A4 landscape");
});

it("does not allow the manual arrival action to issue a certificate", async () => {
  const f = await fixture();
  const late = new Date(end.getTime() + 7 * 24 * 3_600_000);
  expect(await manuallyCheckIn(f.admin.id, f.event.id, f.registration.id, late)).toMatchObject({ outcome: "arrived" });
  await expect(manuallyCheckIn(f.admin.id, f.event.id, f.registration.id, late)).rejects.toMatchObject({ code: "final_scan_required" });
  expect(await db.certificate.count()).toBe(0);
});

it("accepts legacy confirmed arrivals while preserving the original arrival", async () => {
  const f = await fixture();
  await db.registration.update({ where: { id: f.registration.id }, data: { status: "CONFIRMED", checkedInAt: start, checkedInById: f.admin.id } });
  await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, end);
  expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ status: "ATTENDED", checkedInAt: start, endPresenceAt: end });
});

it("checks administrator identity inside the scan service and action", async () => {
  const f = await fixture();
  await expect(confirmQrCheckIn(f.user.id, f.event.id, f.ticket, start)).rejects.toMatchObject({ code: "unauthorized" });
  await createTestSession(f.user.id);
  await expect(scanTicketAction(f.event.id, f.ticket)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  expect(await db.certificate.count()).toBe(0);
});

it("issues a QR on application, keeps it on approval and renews it on reapplication", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const user = await createTestUser();
  const event = await createTestEvent(admin.id);
  expect(await applyToEvent(user.id, event.slug)).toBe("applied");
  const original = await db.registration.findUniqueOrThrow({ where: { userId_eventId: { userId: user.id, eventId: event.id } } });
  expect(original.checkInTicketVersion).toMatch(/^[0-9a-f-]{36}$/);
  await setAdminRegistrationStatus({ eventId: event.id, registrationId: original.id, nextStatus: "CONFIRMED" });
  expect((await db.registration.findUniqueOrThrow({ where: { id: original.id } })).checkInTicketVersion).toBe(original.checkInTicketVersion);
  await cancelOwnRegistration(user.id, original.id);
  expect(await applyToEvent(user.id, event.slug)).toBe("reapplied");
  expect((await db.registration.findUniqueOrThrow({ where: { id: original.id } })).checkInTicketVersion).not.toBe(original.checkInTicketVersion);
});

it("keeps presence and certificate creation atomic when certificate persistence fails", async () => {
  const f = await fixture();
  await confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, start);
  await db.$executeRawUnsafe('ALTER TABLE "Certificate" ADD CONSTRAINT "test_issuance_failure" CHECK (false)');
  try {
    await expect(confirmQrCheckIn(f.admin.id, f.event.id, f.ticket, end)).rejects.toMatchObject({ code: "unavailable" });
    expect(await db.registration.findUniqueOrThrow({ where: { id: f.registration.id } })).toMatchObject({ endPresenceAt: null, endPresenceById: null });
    expect(await db.certificate.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE "Certificate" DROP CONSTRAINT "test_issuance_failure"');
  }
});

it("keeps certificate tables protected from public database access", async () => {
  const tables = await db.$queryRaw<Array<{ rowsecurity: boolean }>>`SELECT rowsecurity FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'Certificate'`;
  expect(tables).toEqual([{ rowsecurity: true }]);
});

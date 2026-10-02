import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TicketPage from "@app/my/registrations/[id]/ticket/page";
import { formatUtcTimestamp } from "@/lib/event-presentation";
import { db } from "@/lib/db";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";

async function renderTicket(id: string) {
  return renderToStaticMarkup(
    await TicketPage({ params: Promise.resolve({ id }) }),
  );
}

async function expectGuard(
  operation: Promise<unknown>,
  code: "TEST_REDIRECT" | "TEST_NOT_FOUND",
) {
  try {
    await operation;
    throw new Error(`Expected ${code} from the access guard.`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

it("presents the ticket as title, status, QR, identity, schedule, and one place line", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser({
    name: "Ada Lovelace",
    email: "ada.ticket@example.test",
  });
  const startsAt = new Date("2032-06-01T10:00:00.000Z");
  const endsAt = new Date("2032-06-01T12:00:00.000Z");
  const event = await createTestEvent(admin.id, {
    title: "Evening lecture",
    slug: "evening-lecture",
    startsAt,
    endsAt,
    location: "Old campus",
    venueName: "Auditorium",
    venueAddress: "1 Secret Street",
    mapUrl: "https://maps.example/secret",
  });
  const registration = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  await createTestSession(owner.id);

  const markup = await renderTicket(registration.id);
  const returnAt = markup.indexOf("Back to my events");
  const titleAt = markup.indexOf("Evening lecture");
  expect(returnAt).toBeGreaterThan(-1);
  expect(titleAt).toBeGreaterThan(returnAt);
  const statusAt = markup.indexOf("Confirmed", titleAt);
  const qrAt = markup.indexOf(`/api/tickets/${registration.id}/qr`, statusAt);
  const nameAt = markup.indexOf("Ada Lovelace", qrAt);
  const emailAt = markup.indexOf("ada.ticket@example.test", nameAt);
  const scheduleAt = markup.indexOf(formatUtcTimestamp(startsAt), emailAt);
  const placeAt = markup.indexOf("Auditorium", scheduleAt);
  const saveAt = markup.indexOf("Save QR", placeAt);
  const viewAt = markup.indexOf('href="/events/evening-lecture"', saveAt);

  expect(titleAt).toBeGreaterThan(-1);
  expect(statusAt).toBeGreaterThan(titleAt);
  expect(qrAt).toBeGreaterThan(statusAt);
  expect(nameAt).toBeGreaterThan(qrAt);
  expect(emailAt).toBeGreaterThan(nameAt);
  expect(scheduleAt).toBeGreaterThan(emailAt);
  expect(placeAt).toBeGreaterThan(scheduleAt);
  expect(saveAt).toBeGreaterThan(placeAt);
  expect(viewAt).toBeGreaterThan(saveAt);
  expect(markup).toContain(formatUtcTimestamp(endsAt));
  expect(markup).toContain("UTC");
  expect(markup).toContain(
    `download="event-ticket-${registration.id}.svg"`,
  );
  expect(markup).toContain("Back to my events");
  expect(markup.match(/<img\b/g)).toHaveLength(1);

  const image = markup.match(/<img\b[^>]*>/)?.[0] ?? "";
  expect(image).toContain('alt="QR code for this event ticket"');
  expect(image).toContain('src="/api/tickets/');
  expect(image).not.toContain("ada.ticket@example.test");
  expect(image).not.toContain("Ada Lovelace");
  expect(markup).not.toContain("Old campus");
  expect(markup).not.toContain("1 Secret Street");
  expect(markup).not.toContain("https://maps.example/secret");
  expect(markup).not.toMatch(/wallet/i);
  expect(markup).toContain("Arrival scanning is available at any time");
  expect(markup).not.toContain("Check-in opens");
  expect(markup).toContain("does not check you in");
});

it("keeps a usable QR at any time and distinguishes recorded arrival", async () => {
  const admin = await createTestUser({ role: "ADMIN", name: "Organizer" });
  const owner = await createTestUser({
    name: "Grace Hopper",
    email: "grace.ticket@example.test",
  });
  const startsAt = new Date(Date.now() - 30 * 60 * 1000);
  const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const arrivedAt = new Date(Date.now() - 10 * 60 * 1000);
  const event = await createTestEvent(admin.id, {
    title: "Open workshop",
    location: "Room 4",
    startsAt,
    endsAt,
  });
  const registration = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
      checkedInAt: arrivedAt,
      checkedInById: admin.id,
    },
  });
  await createTestSession(owner.id);

  const markup = await renderTicket(registration.id);

  expect(markup).toContain("Arrival scanning is available at any time");
  expect(markup).toContain(formatUtcTimestamp(endsAt));
  expect(markup.replace(/<[^>]*>/g, "")).toContain(`Arrival was recorded at ${formatUtcTimestamp(arrivedAt)}`);
  expect(markup).toContain("Attendance is confirmed");
  expect(markup).toContain("second scan after the event ends");
  expect(markup).toMatch(/data-slot="badge" data-variant="info"[^>]*>Confirmed<\/span>/);
  expect(markup).not.toMatch(/>Attended<\/span>/);
  expect(markup).toContain("Room 4");
  expect(markup).toContain(`/api/tickets/${registration.id}/qr`);
  expect(markup).toContain("Save QR");
  expect(markup).not.toContain("Check-in opens");
  expect(markup).not.toContain("Scanning is closed");
});

it("withholds the QR and gives a next link for each unusable ticket", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser({ email: "owner.ticket@example.test" });
  const futureStart = new Date("2033-04-01T10:00:00.000Z");
  const futureEnd = new Date("2033-04-01T12:00:00.000Z");
  const published = await createTestEvent(admin.id, {
    title: "Pending forum",
    slug: "pending-forum",
    startsAt: futureStart,
    endsAt: futureEnd,
    location: "Hall",
  });
  const pending = await db.registration.create({
    data: { userId: owner.id, eventId: published.id, status: "REGISTERED" },
  });
  const revoked = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: (
        await createTestEvent(admin.id, {
          title: "Revoked forum",
          slug: "revoked-forum",
          startsAt: futureStart,
          endsAt: futureEnd,
        })
      ).id,
      status: "CANCELLED",
      cancelledBy: "PARTICIPANT",
    },
  });
  const endedEvent = await createTestEvent(admin.id, {
    title: "Ended forum",
    slug: "ended-forum",
    startsAt: new Date("2020-01-01T10:00:00.000Z"),
    endsAt: new Date("2020-01-01T12:00:00.000Z"),
  });
  const ended = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: endedEvent.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
      checkedInAt: new Date("2020-01-01T10:05:00.000Z"),
      checkedInById: admin.id,
    },
  });
  const cancelledEvent = await createTestEvent(admin.id, {
    title: "Cancelled forum",
    slug: "cancelled-forum",
    status: "CANCELLED",
    startsAt: futureStart,
    endsAt: futureEnd,
  });
  const cancelled = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: cancelledEvent.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  const draft = await createTestEvent(admin.id, {
    title: "Draft forum",
    slug: "draft-forum",
    status: "DRAFT",
    startsAt: futureStart,
    endsAt: futureEnd,
  });
  const unpublished = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: draft.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  const noShowEvent = await createTestEvent(admin.id, {
    title: "No-show forum",
    slug: "no-show-forum",
    startsAt: futureStart,
    endsAt: futureEnd,
  });
  const noShow = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: noShowEvent.id,
      status: "NO_SHOW",
    },
  });

  await createTestSession(owner.id);

  const pendingMarkup = await renderTicket(pending.id);
  expect(pendingMarkup).toContain("revoked or is no longer current");
  expect(pendingMarkup).toContain('href="/events/pending-forum"');
  expect(pendingMarkup).toContain("View event");
  expect(pendingMarkup).not.toMatch(/<img\b/);
  expect(pendingMarkup).not.toContain("/api/tickets/");
  expect(pendingMarkup).not.toContain("Save QR");

  const revokedMarkup = await renderTicket(revoked.id);
  expect(revokedMarkup).toContain("revoked when the registration was cancelled");
  expect(revokedMarkup).toContain('href="/events/revoked-forum"');
  expect(revokedMarkup).not.toMatch(/<img\b/);

  const endedMarkup = await renderTicket(ended.id);
  expect(endedMarkup).toContain("Final verification is available with no deadline");
  expect(endedMarkup).toContain("Arrival was recorded at");
  expect(endedMarkup).toContain("Attendance is confirmed");
  expect(endedMarkup).toContain(`/api/tickets/${ended.id}/qr`);

  const cancelledMarkup = await renderTicket(cancelled.id);
  expect(cancelledMarkup).toContain("This event has been cancelled");
  expect(cancelledMarkup).toContain("cannot be used for check-in");
  expect(cancelledMarkup).toContain('href="/events/cancelled-forum"');
  expect(cancelledMarkup).not.toMatch(/<img\b/);

  const noShowMarkup = await renderTicket(noShow.id);
  expect(noShowMarkup).toContain("marked no-show");
  expect(noShowMarkup).toContain("no usable ticket");
  expect(noShowMarkup).not.toMatch(/<img\b/);

  const ownerDraftMarkup = await renderTicket(unpublished.id);
  expect(ownerDraftMarkup).toContain("unpublished");
  expect(ownerDraftMarkup).toContain('href="/my"');
  expect(ownerDraftMarkup).not.toContain("/events/draft-forum");
  expect(ownerDraftMarkup).not.toMatch(/<img\b/);

  await createTestSession(admin.id);
  const adminDraftMarkup = await renderTicket(unpublished.id);
  expect(adminDraftMarkup).toContain("unpublished");
  expect(adminDraftMarkup).toContain(`href="/admin/events/${draft.id}"`);
  expect(adminDraftMarkup).toContain("Open event in admin");
  expect(adminDraftMarkup).not.toContain("/events/draft-forum");
  expect(adminDraftMarkup).not.toMatch(/<img\b/);
});

it("sends anonymous ticket requests to login and hides other accounts", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser();
  const event = await createTestEvent(admin.id);
  const registration = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });

  try {
    await renderTicket(registration.id);
    throw new Error("Expected anonymous visitors to be sent to login.");
  } catch (error) {
    expect(error).toMatchObject({
      code: "TEST_REDIRECT",
      destination: "/login",
    });
  }

  const stranger = await createTestUser();
  await createTestSession(stranger.id);
  await expectGuard(renderTicket(registration.id), "TEST_NOT_FOUND");
});

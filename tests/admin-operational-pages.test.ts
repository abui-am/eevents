import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import AdminPage from "@app/admin/page";
import AdminCheckInPage from "@app/admin/events/[id]/check-in/page";
import AdminEventPage from "@app/admin/events/[id]/page";
import { db } from "@/lib/db";
import { createTicketReference } from "@/lib/check-in-tickets";
import { createEventHost } from "@/services/event-host-service";
import { createTestEvent, createTestSession, createTestUser } from "./support/database";

it("shows admin cover thumbnails and operational state on participant and check-in pages", async () => {
  const admin = await createTestUser({ role: "ADMIN", name: "Event Admin" });
  const participant = await createTestUser({
    name: "Mina Participant",
    email: "mina-participant@example.test",
  });
  await createTestSession(admin.id);
  const startsAt = new Date(Date.now() + 30 * 60 * 1000);
  const event = await createTestEvent(admin.id, {
    title: "North Workshop",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
    capacity: 12,
    status: "PUBLISHED",
    coverKey: "covers/event/north.webp",
  });
  const host = await createEventHost(event.id, {
    name: "Ada Lovelace",
    biography: "Host biography should stay on the edit form",
    publicEmail: "",
    avatarKey: "avatars/event/ada.webp",
  });
  const registration = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: event.id,
      status: "REGISTERED",
    },
  });

  const index = renderToStaticMarkup(
    await AdminPage({ searchParams: Promise.resolve({}) }),
  );
  expect(index).toContain("North Workshop");
  expect(index).toContain("Published");
  expect(index).toContain("UTC");
  expect(index).toContain("1 / 12");
  expect(index).toContain("Manage");
  expect(index).toContain(`/admin/events/${event.id}`);
  expect(index).toContain("<img");
  expect(index).toContain(`/events/${event.slug}/cover`);
  expect(index).not.toContain("covers/event/north.webp");
  expect(index).not.toContain("Ada Lovelace");

  const participants = renderToStaticMarkup(
    await AdminEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(participants).toContain("<table");
  expect(participants).toContain("Mina Participant");
  expect(participants).toContain("mina-participant@example.test");
  expect(participants).toContain('data-label="Participant"');
  expect(participants).toContain('data-label="Registration"');
  expect(participants).toContain('data-label="Arrival"');
  expect(participants).toContain('data-label="Attendance"');
  expect(participants).toContain('data-label="Certificate"');
  expect(participants).toContain('data-label="Actions"');
  expect(participants).toContain("Awaiting confirmation");
  expect(participants).toContain("No arrival recorded");
  expect(participants).toContain("Attendance not recorded");
  expect(participants).toContain("Not eligible for a certificate");
  expect(participants).toContain(`src="/events/${event.slug}/cover"`);
  expect(participants).toContain('alt="North Workshop"');
  expect(participants).toContain("Ada Lovelace");
  expect(participants).toContain(
    `src="/events/${event.slug}/hosts/${host.hostId}/avatar"`,
  );
  expect(participants).toContain('alt=""');
  expect(participants).not.toContain("Host biography should stay on the edit form");
  expect(participants).toContain(">Confirm</button>");
  expect(participants).toContain(">Decline</button>");
  expect(participants).toContain("Check in manually");
  expect(participants).not.toContain("Mark attended");

  const ticketVersion = randomUUID();
  await db.registration.update({
    where: { id: registration.id },
    data: { status: "CONFIRMED", checkInTicketVersion: ticketVersion },
  });
  const ticket = createTicketReference({
    eventId: event.id,
    registrationId: registration.id,
    ticketVersion,
  });
  const review = renderToStaticMarkup(
    await AdminCheckInPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ ticket }),
    }),
  );
  expect(review).toContain("Confirmed");
  expect(review).toContain("No arrival recorded");
  expect(review).toContain("Attendance not recorded");
  expect(review).toContain("Not eligible for a certificate");
  expect(review).toContain("Recording onsite scan");
  expect(review).toContain(">Record attendance</button>");
  expect(review).not.toContain("Undo arrival");

  await db.registration.update({
    where: { id: registration.id },
    data: { status: "ATTENDED" },
  });
  const attended = renderToStaticMarkup(
    await AdminCheckInPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ ticket }),
    }),
  );
  expect(attended).toMatch(/<dd><span data-slot="badge" data-variant="success"[^>]*>Attended<\/span><\/dd>/);
  expect(attended).toContain("Attendance recorded");
  expect(attended).toContain("Certificate not issued yet");

  await db.registration.update({
    where: { id: registration.id },
    data: {
      certificateKey: `${registration.id}.pdf`,
      certificateUploadedAt: new Date(),
    },
  });
  const issued = renderToStaticMarkup(
    await AdminCheckInPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ ticket }),
    }),
  );
  expect(issued).toContain("Certificate issued");
  expect(issued).toContain("Attendance recorded");
});

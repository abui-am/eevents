import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import AdminCheckInPage from "@app/admin/events/[id]/check-in/page";
import {
  confirmQrCheckInAction,
  manualCheckInAction,
  undoCheckInAction,
} from "@app/actions/check-in";
import { db } from "@/lib/db";
import { createTicketReference } from "@/lib/check-in-tickets";
import { checkInReturnPath, safeLoginReturnPath } from "@/lib/redirects";
import { setAdminRegistrationStatus } from "@/services/admin-event-service";
import {
  confirmQrCheckIn,
  getCheckInReview,
  manuallyCheckIn,
  undoCheckIn,
} from "@/services/check-in-service";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";

async function createConfirmedRegistration(input: {
  startsAt: Date;
  endsAt: Date;
  eventStatus?: "DRAFT" | "PUBLISHED" | "CANCELLED";
}) {
  const admin = await createTestUser({ role: "ADMIN", name: "Event Admin" });
  const participant = await createTestUser({ name: "Ticket Holder" });
  const event = await createTestEvent(admin.id, {
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: input.eventStatus,
  });
  const ticketVersion = randomUUID();
  const registration = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: ticketVersion,
    },
  });

  return {
    admin,
    participant,
    event,
    registration,
    ticketVersion,
    ticket: createTicketReference({
      eventId: event.id,
      registrationId: registration.id,
      ticketVersion,
    }),
  };
}

it("shows a valid ticket to an admin without recording arrival", async () => {
  const now = new Date("2030-04-05T09:15:00.000Z");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });

  await expect(
    getCheckInReview(fixture.event.id, fixture.ticket, now),
  ).resolves.toMatchObject({
    eventId: fixture.event.id,
    participantName: "Ticket Holder",
    participantEmail: fixture.participant.email,
    registrationStatus: "CONFIRMED",
    checkedInAt: null,
    canCheckIn: true,
    unavailableReason: null,
  });
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } }),
  ).resolves.toMatchObject({ checkedInAt: null, checkedInById: null });
});

it("hides tampered, cross-event, and superseded ticket references", async () => {
  const now = new Date("2030-04-05T09:15:00.000Z");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  const otherEvent = await createTestEvent(fixture.admin.id, {
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  const superseded = createTicketReference({
    eventId: fixture.event.id,
    registrationId: fixture.registration.id,
    ticketVersion: randomUUID(),
  });

  await expect(
    getCheckInReview(fixture.event.id, `${fixture.ticket.slice(0, -1)}x`, now),
  ).resolves.toBeNull();
  await expect(
    getCheckInReview(otherEvent.id, fixture.ticket, now),
  ).resolves.toBeNull();
  await expect(
    getCheckInReview(fixture.event.id, superseded, now),
  ).resolves.toBeNull();
});

it("allows arrival at any time but keeps cancelled events unavailable", async () => {
  const beforeOpening = new Date("2030-04-05T08:59:59.999Z");
  const closed = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  const cancelled = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
    eventStatus: "CANCELLED",
  });

  await expect(
    getCheckInReview(closed.event.id, closed.ticket, beforeOpening),
  ).resolves.toMatchObject({
    canCheckIn: true,
    unavailableReason: null,
  });
  await expect(
    getCheckInReview(
      cancelled.event.id,
      cancelled.ticket,
      new Date("2030-04-05T10:15:00.000Z"),
    ),
  ).resolves.toMatchObject({
    canCheckIn: false,
    unavailableReason: "event-cancelled",
  });
  await expect(
    getCheckInReview(
      closed.event.id,
      closed.ticket,
      new Date("2030-04-05T09:00:00.000Z"),
    ),
  ).resolves.toMatchObject({ canCheckIn: true, unavailableReason: null });
  await expect(
    getCheckInReview(
      closed.event.id,
      closed.ticket,
      new Date("2030-04-05T11:59:59.999Z"),
    ),
  ).resolves.toMatchObject({ canCheckIn: true, unavailableReason: null });
  await expect(
    getCheckInReview(
      closed.event.id,
      closed.ticket,
      new Date("2030-04-05T12:00:00.000Z"),
    ),
  ).resolves.toMatchObject({ canCheckIn: true, unavailableReason: null, phase: "arrival" });
});

it("records attendance automatically and preserves the first actor and time", async () => {
  const firstAdmin = await createTestUser({ role: "ADMIN", name: "First Admin" });
  const secondAdmin = await createTestUser({ role: "ADMIN", name: "Second Admin" });
  const now = new Date("2030-04-05T09:00:00.000Z");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });

  const first = await confirmQrCheckIn(
    firstAdmin.id,
    fixture.event.id,
    fixture.ticket,
    now,
  );
  const duplicate = await confirmQrCheckIn(
    secondAdmin.id,
    fixture.event.id,
    fixture.ticket,
    new Date(now.getTime() + 5_000),
  );
  const saved = await db.registration.findUniqueOrThrow({
    where: { id: fixture.registration.id },
  });

  expect(first.alreadyCheckedIn).toBe(false);
  expect(duplicate.alreadyCheckedIn).toBe(true);
  expect(saved).toMatchObject({
    status: "ATTENDED",
    checkedInAt: now,
    checkedInById: firstAdmin.id,
    checkInTicketVersion: fixture.ticketVersion,
  });
});

it("serializes simultaneous scans into one arrival record", async () => {
  const firstAdmin = await createTestUser({ role: "ADMIN", name: "Scanner One" });
  const secondAdmin = await createTestUser({ role: "ADMIN", name: "Scanner Two" });
  const firstTime = new Date("2030-04-05T09:10:00.000Z");
  const secondTime = new Date("2030-04-05T09:10:01.000Z");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });

  const results = await Promise.all([
    confirmQrCheckIn(firstAdmin.id, fixture.event.id, fixture.ticket, firstTime),
    confirmQrCheckIn(secondAdmin.id, fixture.event.id, fixture.ticket, secondTime),
  ]);
  const saved = await db.registration.findUniqueOrThrow({
    where: { id: fixture.registration.id },
  });
  const originalArrival = results.find((result) => !result.alreadyCheckedIn);

  expect(results.filter((result) => !result.alreadyCheckedIn)).toHaveLength(1);
  expect(results.filter((result) => result.alreadyCheckedIn)).toHaveLength(1);
  expect(saved.checkedInAt).toEqual(originalArrival?.checkedInAt);
  expect(saved.checkedInById).toEqual(originalArrival?.checkedInById);
});

it("does not let a stale QR record arrival after registration cancellation", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const startsAt = new Date(Date.now() + 30 * 60 * 1000);
  const fixture = await createConfirmedRegistration({
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
  });
  const outcomes = await Promise.allSettled([
    confirmQrCheckIn(admin.id, fixture.event.id, fixture.ticket),
    setAdminRegistrationStatus({
      eventId: fixture.event.id,
      registrationId: fixture.registration.id,
      nextStatus: "CANCELLED",
    }),
  ]);
  const current = await db.registration.findUniqueOrThrow({
    where: { id: fixture.registration.id },
  });

  expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
  if (current.status === "CANCELLED") {
    expect(current).toMatchObject({ checkInTicketVersion: null, checkedInAt: null, checkedInById: null });
    await expect(confirmQrCheckIn(admin.id, fixture.event.id, fixture.ticket)).rejects.toMatchObject({ code: "invalid_ticket" });
  } else {
    expect(current.status).toBe("ATTENDED");
    await expect(setAdminRegistrationStatus({ eventId: fixture.event.id, registrationId: current.id, nextStatus: "CANCELLED" })).rejects.toMatchObject({ code: "invalid_transition" });
  }
});

it("allows manual check-in for a confirmed registration and rejects pending applications", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const pendingParticipant = await createTestUser();
  const startsAt = new Date("2030-04-05T10:00:00.000Z");
  const event = await createTestEvent(admin.id, {
    startsAt,
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  const pending = await db.registration.create({
    data: { userId: pendingParticipant.id, eventId: event.id },
  });
  const confirmed = await createConfirmedRegistration({
    startsAt,
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });

  await expect(
    manuallyCheckIn(admin.id, event.id, pending.id, new Date("2030-04-05T09:00:00Z")),
  ).rejects.toMatchObject({ code: "registration_ineligible" });

  const result = await manuallyCheckIn(
    admin.id,
    confirmed.event.id,
    confirmed.registration.id,
    new Date("2030-04-05T09:00:00Z"),
  );
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: confirmed.registration.id } }),
  ).resolves.toMatchObject({
    checkedInById: admin.id,
    status: "ATTENDED",
  });
  expect(result.alreadyCheckedIn).toBe(false);
});

it("never undoes automatically recorded attendance", async () => {
  const now = new Date("2030-04-05T10:00:00Z");
  const fixture = await createConfirmedRegistration({ startsAt: now, endsAt: new Date("2030-04-05T12:00:00Z") });
  await confirmQrCheckIn(fixture.admin.id, fixture.event.id, fixture.ticket, now);
  await expect(undoCheckIn(fixture.admin.id, fixture.event.id, fixture.registration.id, now)).rejects.toMatchObject({ code: "undo_unavailable" });
  expect(await db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } })).toMatchObject({ status: "ATTENDED", checkedInAt: now });
});

it("redirects anonymous ticket scans through login to the same local review page", async () => {
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  const returnPath = checkInReturnPath(fixture.event.id, fixture.ticket);
  expect(returnPath).not.toBeNull();

  try {
    await AdminCheckInPage({
      params: Promise.resolve({ id: fixture.event.id }),
      searchParams: Promise.resolve({ ticket: fixture.ticket }),
    });
    throw new Error("Expected the unauthenticated scan to redirect to login.");
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_REDIRECT" });
    expect(error).toMatchObject({
      destination: `/login?next=${encodeURIComponent(returnPath!)}`,
    });
  }

  await expect(safeLoginReturnPath(returnPath)).resolves.toBe(returnPath);
  await expect(
    safeLoginReturnPath("https://attacker.example/collect"),
  ).resolves.toBeNull();
});

it("renders the read-only review for an admin session", async () => {
  const now = new Date("2030-04-05T09:15:00.000Z");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  await createTestSession(fixture.admin.id);

  const page = await AdminCheckInPage({
    params: Promise.resolve({ id: fixture.event.id }),
    searchParams: Promise.resolve({ ticket: fixture.ticket }),
  });

  expect(page).toBeDefined();
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } }),
  ).resolves.toMatchObject({ checkedInAt: null, checkedInById: null });
  await expect(
    getCheckInReview(fixture.event.id, fixture.ticket, now),
  ).resolves.toMatchObject({ canCheckIn: true, checkedInAt: null });
});

it("derives the check-in actor from the admin session, not submitted fields", async () => {
  const sessionAdmin = await createTestUser({ role: "ADMIN", name: "Session Admin" });
  const forgedAdmin = await createTestUser({ role: "ADMIN", name: "Forged Admin" });
  const startsAt = new Date(Date.now() + 30 * 60 * 1000);
  const fixture = await createConfirmedRegistration({
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
  });
  await createTestSession(sessionAdmin.id);
  const formData = new FormData();
  formData.set("eventId", fixture.event.id);
  formData.set("ticket", fixture.ticket);
  formData.set("adminId", forgedAdmin.id);

  try {
    await confirmQrCheckInAction(formData);
    throw new Error("Expected the successful check-in action to redirect.");
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_REDIRECT" });
  }

  await expect(
    db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } }),
  ).resolves.toMatchObject({
    checkedInAt: expect.any(Date),
    checkedInById: sessionAdmin.id,
    status: "ATTENDED",
  });
});

it("hides ticket review from participants and rejects their check-in actions", async () => {
  const fixture = await createConfirmedRegistration({
    startsAt: new Date("2030-04-05T10:00:00.000Z"),
    endsAt: new Date("2030-04-05T12:00:00.000Z"),
  });
  await createTestSession(fixture.participant.id);

  try {
    await AdminCheckInPage({
      params: Promise.resolve({ id: fixture.event.id }),
      searchParams: Promise.resolve({ ticket: fixture.ticket }),
    });
    throw new Error("Expected participant ticket review to return not found.");
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_NOT_FOUND" });
  }

  const confirmation = new FormData();
  confirmation.set("eventId", fixture.event.id);
  confirmation.set("ticket", fixture.ticket);
  const manual = new FormData();
  manual.set("eventId", fixture.event.id);
  manual.set("registrationId", fixture.registration.id);
  const undo = new FormData();
  undo.set("eventId", fixture.event.id);
  undo.set("registrationId", fixture.registration.id);

  for (const action of [
    confirmQrCheckInAction(confirmation),
    manualCheckInAction(manual),
    undoCheckInAction(undo),
  ]) {
    await expect(action).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  }
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } }),
  ).resolves.toMatchObject({ checkedInAt: null, checkedInById: null });
});

it("validates scanner tickets under an admin session without recording arrival", async () => {
  const { reviewScannedTicketAction } = await import("@app/actions/check-in");
  const fixture = await createConfirmedRegistration({
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  await createTestSession(fixture.admin.id);
  await expect(reviewScannedTicketAction(fixture.event.id, fixture.ticket)).resolves.toEqual({
    href: checkInReturnPath(fixture.event.id, fixture.ticket),
  });
  await expect(reviewScannedTicketAction("another-event", fixture.ticket)).resolves.toHaveProperty("error");
  await expect(reviewScannedTicketAction(fixture.event.id, `${fixture.ticket}tampered`)).resolves.toHaveProperty("error");
  await expect(db.registration.findUniqueOrThrow({ where: { id: fixture.registration.id } })).resolves.toMatchObject({ checkedInAt: null });
  await db.registration.update({ where: { id: fixture.registration.id }, data: { checkInTicketVersion: randomUUID() } });
  await expect(reviewScannedTicketAction(fixture.event.id, fixture.ticket)).resolves.toHaveProperty("error");
  await createTestSession(fixture.participant.id);
  await expect(reviewScannedTicketAction(fixture.event.id, fixture.ticket)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
});

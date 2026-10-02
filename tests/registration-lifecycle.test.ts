import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  applyToEvent,
  cancelOwnRegistration,
} from "@/services/registration-service";
import { saveAdminEvent, setAdminRegistrationStatus } from "@/services/admin-event-service";
import {
  createTestEvent,
  createTestUser,
} from "./support/database";

it("rejects a duplicate registration and reserves only one row", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(organizer.id, { capacity: 5 });

  const outcomes = await Promise.all([
    applyToEvent(participant.id, event.slug),
    applyToEvent(participant.id, event.slug),
  ]);

  expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome === "already")).toHaveLength(1);
  expect(await db.registration.count({ where: { eventId: event.id } })).toBe(1);
});

it("allows exactly one concurrent registration for the last seat", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const firstParticipant = await createTestUser();
  const secondParticipant = await createTestUser();
  const event = await createTestEvent(organizer.id, { capacity: 1 });

  const outcomes = await Promise.all([
    applyToEvent(firstParticipant.id, event.slug),
    applyToEvent(secondParticipant.id, event.slug),
  ]);

  expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome !== "applied")).toHaveLength(1);
  expect(
    await db.registration.count({
      where: { eventId: event.id, status: { not: "CANCELLED" } },
    }),
  ).toBe(1);
});

it("rejects invalid status transitions", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(organizer.id);
  const registered = await db.registration.create({
    data: { userId: participant.id, eventId: event.id, status: "REGISTERED" },
  });
  const cancelled = await db.registration.create({
    data: {
      userId: (await createTestUser()).id,
      eventId: event.id,
      status: "CANCELLED",
      cancelledBy: "PARTICIPANT",
    },
  });

  await expect(
    setAdminRegistrationStatus({
      eventId: event.id,
      registrationId: registered.id,
      nextStatus: "ATTENDED",
    }),
  ).rejects.toMatchObject({ code: "invalid_transition" });
  await expect(
    setAdminRegistrationStatus({
      eventId: event.id,
      registrationId: cancelled.id,
      nextStatus: "CONFIRMED",
    }),
  ).rejects.toMatchObject({ code: "invalid_transition" });
});

it("rejects an event capacity below its active registration count", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const firstParticipant = await createTestUser();
  const secondParticipant = await createTestUser();
  const event = await createTestEvent(organizer.id, { capacity: 2 });
  await db.registration.createMany({
    data: [
      { userId: firstParticipant.id, eventId: event.id, status: "REGISTERED" },
      { userId: secondParticipant.id, eventId: event.id, status: "CONFIRMED" },
    ],
  });

  await expect(
    saveAdminEvent(organizer.id, event.id, {
      title: event.title,
      description: event.description,
      location: "",
      startsAt: toDateTimeLocal(event.startsAt),
      endsAt: toDateTimeLocal(event.endsAt),
      capacity: "1",
      status: "PUBLISHED",
    }),
  ).rejects.toMatchObject({ code: "capacity_too_low" });
});

it("records participant cancellation and permits reapplication", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(organizer.id, { capacity: 1 });

  expect(await applyToEvent(participant.id, event.slug)).toBe("applied");
  const registration = await db.registration.findUniqueOrThrow({
    where: { userId_eventId: { userId: participant.id, eventId: event.id } },
  });
  expect(await cancelOwnRegistration(participant.id, registration.id)).toBe("cancelled");

  const cancelled = await db.registration.findUniqueOrThrow({
    where: { id: registration.id },
  });
  expect(cancelled.status).toBe("CANCELLED");
  expect(cancelled.cancelledBy).toBe("PARTICIPANT");
  expect(cancelled.checkInTicketVersion).toBeNull();
  expect(await applyToEvent(participant.id, event.slug)).toBe("reapplied");

  const reapplied = await db.registration.findUniqueOrThrow({
    where: { id: registration.id },
  });
  expect(reapplied.status).toBe("REGISTERED");
  expect(reapplied.cancelledBy).toBeNull();
});

it("lets an admin reopen an admin-cancelled registration when capacity remains", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(organizer.id, { capacity: 2 });
  const registration = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: event.id,
      status: "CANCELLED",
      cancelledBy: "ADMIN",
      checkInTicketVersion: randomUUID(),
    },
  });

  await expect(
    setAdminRegistrationStatus({
      eventId: event.id,
      registrationId: registration.id,
      nextStatus: "REGISTERED",
    }),
  ).resolves.toMatchObject({ status: "REGISTERED" });

  await expect(
    db.registration.findUniqueOrThrow({ where: { id: registration.id } }),
  ).resolves.toMatchObject({
    status: "REGISTERED",
    cancelledBy: null,
    checkInTicketVersion: expect.any(String),
    checkedInAt: null,
  });
});

function toDateTimeLocal(value: Date): string {
  return value.toISOString().slice(0, 16);
}

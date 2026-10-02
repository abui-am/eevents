import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import { getTicketPresentation } from "@/services/ticket-service";
import {
  createTestEvent,
  createTestUser,
} from "./support/database";

it("allows tickets on application and limits ticket access to the owner or admin", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser();
  const otherParticipant = await createTestUser();
  const confirmedOwner = await createTestUser();
  const event = await createTestEvent(organizer.id);
  const pending = await db.registration.create({
    data: { userId: owner.id, eventId: event.id, status: "REGISTERED", checkInTicketVersion: randomUUID() },
  });
  const pendingTicket = await getTicketPresentation(
    pending.id,
    { id: owner.id, role: "PARTICIPANT" },
  );
  expect(pendingTicket).toMatchObject({
    usable: true,
    status: "REGISTERED",
  });

  const ticketVersion = randomUUID();
  const confirmed = await db.registration.create({
    data: {
      userId: confirmedOwner.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: ticketVersion,
    },
  });
  expect(
    await getTicketPresentation(confirmed.id, {
      id: otherParticipant.id,
      role: "PARTICIPANT",
    }),
  ).toBeNull();
  await expect(
    getTicketPresentation(confirmed.id, {
      id: confirmedOwner.id,
      role: "PARTICIPANT",
    }),
  ).resolves.toMatchObject({ usable: true, ticketVersion });
  await expect(
    getTicketPresentation(confirmed.id, { id: organizer.id, role: "ADMIN" }),
  ).resolves.toMatchObject({ usable: true, ticketVersion });
});

it("keeps arrival available before the start and after the end", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const startsAt = new Date("2030-06-01T10:00:00.000Z");
  const endsAt = new Date("2030-06-01T12:00:00.000Z");
  const event = await createTestEvent(organizer.id, { startsAt, endsAt });
  const registration = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  const viewer = { id: participant.id, role: "PARTICIPANT" as const };

  await expect(
    getTicketPresentation(
      registration.id,
      viewer,
      new Date(startsAt.getTime() - 60 * 60 * 1000 - 1),
    ),
  ).resolves.toMatchObject({ checkInOpen: true, usable: true });
  await expect(
    getTicketPresentation(
      registration.id,
      viewer,
      new Date(startsAt.getTime() - 60 * 60 * 1000),
    ),
  ).resolves.toMatchObject({ checkInOpen: true, usable: true });
  await expect(
    getTicketPresentation(registration.id, viewer, new Date(endsAt.getTime() + 3_600_000)),
  ).resolves.toMatchObject({
    checkInOpen: true,
    usable: true,
    phase: "arrival",
  });
});

it("keeps the QR available long after the event for final verification", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser();
  const end = new Date("2030-04-05T12:00:00Z");
  const event = await createTestEvent(admin.id, { startsAt: new Date("2030-04-05T10:00:00Z"), endsAt: end });
  const registration = await db.registration.create({ data: { userId: owner.id, eventId: event.id, status: "ATTENDED", checkedInAt: new Date(end.getTime() - 1000), checkedInById: admin.id, checkInTicketVersion: randomUUID() } });
  expect(await getTicketPresentation(registration.id, { id: owner.id, role: "PARTICIPANT" }, new Date(end.getTime() + 30 * 24 * 3_600_000))).toMatchObject({ usable: true, checkInOpen: true, phase: "final" });
});

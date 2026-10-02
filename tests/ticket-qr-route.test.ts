import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { GET as getTicketQr } from "@app/api/tickets/[id]/qr/route";
import { db } from "@/lib/db";
import { createTestEvent, createTestSession, createTestUser } from "./support/database";

it("renders a private QR image without recording arrival", async () => {
  process.env.APP_ORIGIN = "https://eevents.example";
  const organizer = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(organizer.id);
  const registration = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: event.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  await createTestSession(participant.id);

  const response = await getTicketQr(
    new Request(`https://eevents.example/api/tickets/${registration.id}/qr`),
    { params: Promise.resolve({ id: registration.id }) },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/svg+xml");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).toContain("<svg");
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: registration.id } }),
  ).resolves.toMatchObject({ checkedInAt: null, checkedInById: null });
});

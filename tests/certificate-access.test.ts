import { expect, it, vi } from "vitest";
import { GET as getCertificate } from "@app/api/certificates/[id]/route";
import { db } from "@/lib/db";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";

const { createSignedUrl } = vi.hoisted(() => ({
  createSignedUrl: vi.fn(async (key: string) =>
    `https://storage.example/signed/${key}`
  ),
}));

vi.mock("@/lib/storage", () => ({
  createCertificateSignedUrl: createSignedUrl,
}));

it("redirects anonymous certificate requests to login", async () => {
  try {
    await getCertificate(new Request("https://eevents.example/api/certificates/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    throw new Error("Expected the anonymous request to redirect.");
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_REDIRECT", destination: "/login" });
  }
});

it("allows the owner and admin, while another participant receives 404", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser();
  const otherParticipant = await createTestUser();
  const event = await createTestEvent(organizer.id);
  const registration = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: event.id,
      status: "ATTENDED",
    },
  });
  const certificateKey = `${registration.id}.pdf`;
  await db.registration.update({
    where: { id: registration.id },
    data: { certificateKey, certificateUploadedAt: new Date() },
  });
  const request = new Request(
    `https://eevents.example/api/certificates/${registration.id}`,
  );
  const context = { params: Promise.resolve({ id: registration.id }) };

  await createTestSession(otherParticipant.id);
  try {
    await getCertificate(request, context);
    throw new Error("Expected a cross-user request to return 404.");
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_NOT_FOUND" });
  }
  expect(createSignedUrl).not.toHaveBeenCalled();

  await createTestSession(owner.id);
  const ownerResponse = await getCertificate(request, context);
  expect(ownerResponse.status).toBe(307);
  expect(ownerResponse.headers.get("location")).toBe(
    `https://storage.example/signed/${certificateKey}`,
  );

  await createTestSession(organizer.id);
  const adminResponse = await getCertificate(request, context);
  expect(adminResponse.status).toBe(307);
  expect(createSignedUrl).toHaveBeenCalledTimes(2);
  expect(createSignedUrl).toHaveBeenLastCalledWith(
    certificateKey,
    registration.id,
  );
});

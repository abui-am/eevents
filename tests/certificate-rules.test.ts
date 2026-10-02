import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { POST as completeCertificate } from "@app/api/internal/certificates/complete/route";
import { db } from "@/lib/db";
import { validateCertificatePdf } from "../supabase/functions/_shared/certificate-file";
import { signCertificateToken } from "../supabase/functions/_shared/certificate-upload-token";
import { completeCertificateUpload } from "@/services/certificate-service";
import {
  createTestEvent,
  createTestUser,
} from "./support/database";

it("rejects a non-PDF whose filename ends in .pdf", async () => {
  const renamedFile = new File(["this is not a PDF"], "certificate.pdf", {
    type: "application/pdf",
  });
  const bytes = new Uint8Array(await renamedFile.arrayBuffer());

  expect(validateCertificatePdf(renamedFile.size, bytes)).toBe("invalid_pdf");
});

it("accepts PDF bytes up to 5 MiB and rejects larger uploads", () => {
  const atLimit = new Uint8Array(5 * 1024 * 1024);
  atLimit.set(new TextEncoder().encode("%PDF-"));
  expect(validateCertificatePdf(atLimit.byteLength, atLimit)).toBeNull();

  expect(validateCertificatePdf(5 * 1024 * 1024 + 1, new Uint8Array())).toBe(
    "file_too_large",
  );
});

it("does not complete a certificate upload unless registration is attended", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(admin.id);
  const registration = await db.registration.create({
    data: { userId: participant.id, eventId: event.id, status: "REGISTERED" },
  });
  const uploadedAt = new Date().toISOString();
  const token = await signCertificateToken(
    {
      purpose: "certificate-completion",
      eventId: event.id,
      registrationId: registration.id,
      adminId: admin.id,
      uploadedAt,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      nonce: randomUUID(),
    },
    process.env.CHECKIN_SIGNING_SECRET!,
  );

  const response = await completeCertificate(
    new Request("https://eevents.example/api/internal/certificates/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );

  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toEqual({
    error: "certificate_upload_retired",
  });
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: registration.id } }),
  ).resolves.toMatchObject({ certificateKey: null, certificateUploadedAt: null });
});

it("rejects retired uploads even for attended participants", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(admin.id);
  const registration = await db.registration.create({
    data: { userId: participant.id, eventId: event.id, status: "ATTENDED" },
  });
  const firstUploadedAt = new Date();

  await expect(
    completeCertificateUpload({
      eventId: event.id,
      registrationId: registration.id,
      adminId: admin.id,
      uploadedAt: firstUploadedAt,
    }),
  ).resolves.toBeNull();

  const replacementUploadedAt = new Date(firstUploadedAt.getTime() + 1_000);
  await expect(
    completeCertificateUpload({
      eventId: event.id,
      registrationId: registration.id,
      adminId: admin.id,
      uploadedAt: replacementUploadedAt,
    }),
  ).resolves.toBeNull();
  await expect(
    db.registration.findUniqueOrThrow({ where: { id: registration.id } }),
  ).resolves.toMatchObject({
    certificateKey: null,
    certificateUploadedAt: null,
  });
});

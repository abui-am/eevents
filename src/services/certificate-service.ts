import "server-only";

import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createCertificateSignedUrl } from "@/lib/storage";

const CERTIFICATE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\.pdf$/;

export type CertificateViewer = { id: string; role: Role };

export async function getCertificateUploadContext(registrationId: string) {
  return db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      eventId: true,
      status: true,
      checkedInAt: true,
      certificateKey: true,
      certificateUploadedAt: true,
      certificate: { select: { token: true } },
      endPresenceAt: true,
      participant: { select: { name: true, email: true } },
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });
}

/** Signs only after checking the registration owner or administrator. */
export async function getAuthorizedCertificateDownload(
  registrationId: string,
  viewer: CertificateViewer,
): Promise<string | null> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      userId: true,
      status: true,
      certificateKey: true,
      certificateUploadedAt: true,
    },
  });

  if (
    !registration ||
    (registration.userId !== viewer.id && viewer.role !== "ADMIN") ||
    registration.status !== "ATTENDED" ||
    !registration.certificateKey ||
    !registration.certificateUploadedAt ||
    registration.certificateKey !== `${registration.id}.pdf` ||
    !CERTIFICATE_KEY_PATTERN.test(registration.certificateKey)
  ) {
    return null;
  }

  return createCertificateSignedUrl(registration.certificateKey, registration.id);
}

export async function completeCertificateUpload(input: {
  eventId: string;
  registrationId: string;
  adminId: string;
  uploadedAt: Date;
}): Promise<{ replaced: boolean } | null> {
  void input;
  // Upload completion is retired; old PDF downloads remain supported.
  return null;
}

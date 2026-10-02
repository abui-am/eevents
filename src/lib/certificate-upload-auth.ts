import "server-only";

import { randomUUID } from "node:crypto";
import {
  signCertificateToken,
  type SignedCertificateToken,
} from "../../supabase/functions/_shared/certificate-upload-token";

const UPLOAD_TOKEN_TTL_SECONDS = 3 * 60;
const COMPLETION_TOKEN_TTL_SECONDS = 2 * 60;

function signingSecret(): string {
  const secret = process.env.CHECKIN_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("CHECKIN_SIGNING_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

export async function createCertificateUploadToken(input: {
  eventId: string;
  registrationId: string;
  adminId: string;
}): Promise<string> {
  const payload: SignedCertificateToken = {
    purpose: "certificate-upload",
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS,
    nonce: randomUUID(),
  };
  return signCertificateToken(payload, signingSecret());
}

export function createCertificateCompletionToken(input: {
  eventId: string;
  registrationId: string;
  adminId: string;
  uploadedAt: string;
}): Promise<string> {
  const payload: SignedCertificateToken = {
    purpose: "certificate-completion",
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + COMPLETION_TOKEN_TTL_SECONDS,
    nonce: randomUUID(),
  };
  return signCertificateToken(payload, signingSecret());
}

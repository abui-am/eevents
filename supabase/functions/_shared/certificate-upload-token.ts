export type SignedCertificateToken = {
  purpose: "certificate-upload" | "certificate-completion";
  registrationId: string;
  eventId: string;
  adminId: string;
  expiresAt: number;
  nonce: string;
  uploadedAt?: string;
};

const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
    );
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function importSigningKey(secret: string, usage: "sign" | "verify") {
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("CHECKIN_SIGNING_SECRET must contain at least 32 bytes.");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signCertificateToken(
  payload: SignedCertificateToken,
  secret: string,
): Promise<string> {
  const body = encoder.encode(JSON.stringify(payload));
  const key = await importSigningKey(secret, "sign");
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return `${encodeBase64Url(body)}.${encodeBase64Url(signature)}`;
}

export async function verifyCertificateToken(
  token: unknown,
  secret: string,
): Promise<SignedCertificateToken | null> {
  if (typeof token !== "string" || token.length > 2_048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedBody, encodedSignature] = parts;
  if (!encodedBody || !encodedSignature) return null;

  const body = decodeBase64Url(encodedBody);
  const signature = decodeBase64Url(encodedSignature);
  if (!body || !signature) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(body),
    );
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    (record.purpose !== "certificate-upload" &&
      record.purpose !== "certificate-completion") ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(String(record.registrationId)) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(String(record.eventId)) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(String(record.adminId)) ||
    typeof record.expiresAt !== "number" ||
    !Number.isSafeInteger(record.expiresAt) ||
    typeof record.nonce !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(record.nonce)
  ) return null;

  if (
    record.purpose === "certificate-completion" &&
    (typeof record.uploadedAt !== "string" ||
      !Number.isFinite(Date.parse(record.uploadedAt)))
  ) {
    return null;
  }

  const key = await importSigningKey(secret, "verify");
  const signatureBuffer = Uint8Array.from(signature).buffer;
  const bodyBuffer = Uint8Array.from(body).buffer;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuffer,
    bodyBuffer,
  );
  return valid ? (payload as SignedCertificateToken) : null;
}

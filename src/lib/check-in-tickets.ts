import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type TicketReferencePayload = {
  eventId: string;
  registrationId: string;
  ticketVersion: string;
};

function signingSecret(): string {
  const secret = process.env.CHECKIN_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("CHECKIN_SIGNING_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function ticketMessage(payload: TicketReferencePayload): string {
  return JSON.stringify([
    "eevents-check-in-ticket-v1",
    payload.eventId,
    payload.registrationId,
    payload.ticketVersion,
  ]);
}

function encodeId(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeId(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(encoded)) return null;

  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const decoded = bytes.toString("utf8");
    return ID_PATTERN.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Create an event-bound signed reference. It contains IDs, not attendee data. */
export function createTicketReference(
  payload: TicketReferencePayload,
): string {
  if (
    !ID_PATTERN.test(payload.eventId) ||
    !ID_PATTERN.test(payload.registrationId) ||
    !UUID_PATTERN.test(payload.ticketVersion)
  ) {
    throw new Error("Ticket reference fields are invalid.");
  }

  const signature = createHmac("sha256", signingSecret())
    .update(ticketMessage(payload))
    .digest("base64url");

  return [
    "v1",
    encodeId(payload.eventId),
    encodeId(payload.registrationId),
    payload.ticketVersion,
    signature,
  ].join(".");
}

/** Verify a QR reference without accepting malformed or non-canonical values. */
export function verifyTicketReference(
  reference: unknown,
): TicketReferencePayload | null {
  if (typeof reference !== "string" || reference.length > 1_024) return null;

  const parts = reference.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;

  const eventId = decodeId(parts[1]);
  const registrationId = decodeId(parts[2]);
  const ticketVersion = parts[3];
  const signature = parts[4];
  if (
    !eventId ||
    !registrationId ||
    !UUID_PATTERN.test(ticketVersion) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return null;
  }

  const payload = { eventId, registrationId, ticketVersion };
  const actual = Buffer.from(signature, "base64url");
  if (actual.toString("base64url") !== signature) return null;
  const expected = createHmac("sha256", signingSecret())
    .update(ticketMessage(payload))
    .digest();

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  return payload;
}

export function createCheckInUrl(payload: TicketReferencePayload): string {
  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin) throw new Error("APP_ORIGIN is not configured.");

  const origin = new URL(configuredOrigin);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error("APP_ORIGIN must be a canonical HTTP(S) origin.");
  }

  const url = new URL(
    `/admin/events/${encodeURIComponent(payload.eventId)}/check-in`,
    origin.origin,
  );
  url.searchParams.set("ticket", createTicketReference(payload));
  return url.toString();
}

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  removeEventCoverAction,
  removeHostAvatarAction,
  replaceEventCoverAction,
  replaceHostAvatarAction,
} from "@app/actions/event-media";
import { db } from "@/lib/db";
import { isNewEventMediaObjectKey } from "@/lib/event-media-contract";
import { removeEventHost } from "@/services/event-host-service";
import { deleteRemovedHostAvatar } from "@/services/event-media-service";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";
import { setTestHeaders } from "./support/next-mocks";

const storage = vi.hoisted(() => ({
  uploadEventMediaObject: vi.fn<(objectKey: string, body: Buffer) => Promise<void>>(),
  deleteEventMediaObject: vi.fn<(objectKey: string) => Promise<void>>(),
}));

vi.mock("@/lib/event-media-storage", () => storage);

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .png()
    .toBuffer();
});

beforeEach(() => {
  storage.uploadEventMediaObject.mockReset();
  storage.uploadEventMediaObject.mockResolvedValue(undefined);
  storage.deleteEventMediaObject.mockReset();
  storage.deleteEventMediaObject.mockResolvedValue(undefined);
});

function imageFile(bytes: Buffer, name = "photo.png", type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function redirectFrom(action: () => Promise<void>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a redirect.");
}

async function actingAdmin() {
  const admin = await createTestUser({ role: "ADMIN" });
  await createTestSession(admin.id);
  setTestHeaders({
    origin: "https://eevents.example",
    host: "eevents.example",
  });
  return admin;
}

async function createHost(
  eventId: string,
  avatarKey: string | null,
  displayOrder = 0,
) {
  return db.eventHost.create({
    data: {
      eventId,
      name: "Ada Lovelace",
      displayOrder,
      avatarKey,
    },
  });
}

it("rejects anonymous and non-admin image changes before storage", async () => {
  const organizer = await createTestUser();
  const event = await createTestEvent(organizer.id);
  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "");
  form.set("image", imageFile(png));

  const anonymous = await redirectFrom(() => replaceEventCoverAction(form));
  expect(anonymous).toMatchObject({ code: "TEST_REDIRECT", destination: "/login" });

  await createTestSession(organizer.id);
  setTestHeaders({ origin: "https://eevents.example", host: "eevents.example" });
  const participant = await redirectFrom(() => replaceEventCoverAction(form));
  expect(participant).toMatchObject({ code: "TEST_NOT_FOUND" });
  expect(storage.uploadEventMediaObject).not.toHaveBeenCalled();
});

it("rejects a missing or mismatched Origin, including x-forwarded-host", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/current.webp" });
  await actingAdmin();
  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "covers/event/current.webp");
  form.set("image", imageFile(png));

  setTestHeaders({ host: "eevents.example" });
  const missing = await redirectFrom(() => replaceEventCoverAction(form));
  expect(missing).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=origin_rejected`,
  });

  setTestHeaders({
    origin: "https://evil.example",
    host: "eevents.example",
  });
  const mismatched = await redirectFrom(() => replaceEventCoverAction(form));
  expect(mismatched).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=origin_rejected`,
  });

  setTestHeaders({
    origin: "https://eevents.example",
    host: "eevents.example",
    "x-forwarded-host": "evil.example",
  });
  const forwarded = await redirectFrom(() => replaceEventCoverAction(form));
  expect(forwarded).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=origin_rejected`,
  });
  expect(storage.uploadEventMediaObject).not.toHaveBeenCalled();

  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toBe("covers/event/current.webp");
});

it("accepts Origin that matches x-forwarded-host when Host differs", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id);
  await actingAdmin();
  setTestHeaders({
    origin: "https://Eevents.Example",
    host: "internal.local",
    "x-forwarded-host": "eevents.example, proxy.internal",
  });
  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "");
  form.set("image", imageFile(png, "../../user-supplied-name.webp", "image/jpeg"));

  const redirected = await redirectFrom(() => replaceEventCoverAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageSaved=1`,
  });

  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toMatch(new RegExp(`^covers/${event.id}/[0-9a-f-]{36}\\.webp$`));
  expect(isNewEventMediaObjectKey(saved.coverKey ?? "")).toBe(true);
  expect(saved.coverKey).not.toContain(event.slug);
  expect(saved.coverKey).not.toContain("user-supplied");
  expect(storage.uploadEventMediaObject).toHaveBeenCalledTimes(1);
  const [uploadedKey, uploadedBody] = storage.uploadEventMediaObject.mock.calls[0] ?? [];
  expect(uploadedKey).toBe(saved.coverKey);
  expect(Buffer.isBuffer(uploadedBody)).toBe(true);
  const body = uploadedBody as Buffer;
  expect(body.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(body.subarray(8, 12).toString("ascii")).toBe("WEBP");
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();
  expect(existsSync(join(tmpdir(), "user-supplied-name.webp"))).toBe(false);
  expect(existsSync(join(process.cwd(), "user-supplied-name.webp"))).toBe(false);
  const tempNames = await readdir(tmpdir());
  expect(tempNames.some((name) => name.includes("user-supplied"))).toBe(false);
});

it("rejects a spoofed MIME type and an extracted file over 2 MiB without replacing the image", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/current.webp" });
  await actingAdmin();

  const spoofed = new FormData();
  spoofed.set("eventId", event.id);
  spoofed.set("expectedKey", "covers/event/current.webp");
  spoofed.set("image", imageFile(Buffer.from("not an image"), "portrait.jpg", "image/jpeg"));
  const spoofedRedirect = await redirectFrom(() => replaceEventCoverAction(spoofed));
  expect(spoofedRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=invalid_input`,
  });

  const oversized = new FormData();
  oversized.set("eventId", event.id);
  oversized.set("expectedKey", "covers/event/current.webp");
  oversized.set(
    "image",
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
  );
  const oversizedRedirect = await redirectFrom(() => replaceEventCoverAction(oversized));
  expect(oversizedRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=invalid_input`,
  });

  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toBe("covers/event/current.webp");
  expect(storage.uploadEventMediaObject).not.toHaveBeenCalled();
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();
});

it("swaps a cover only when the stored key still matches and deletes the previous object afterward", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/old.webp" });
  await actingAdmin();
  let coverWhenDeleted: string | null = "missing";
  storage.deleteEventMediaObject.mockImplementation(async () => {
    const row = await db.event.findUnique({ where: { id: event.id }, select: { coverKey: true } });
    coverWhenDeleted = row?.coverKey ?? null;
  });

  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "covers/event/old.webp");
  form.set("image", imageFile(png));
  const redirected = await redirectFrom(() => replaceEventCoverAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageSaved=1`,
  });

  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).not.toBe("covers/event/old.webp");
  expect(coverWhenDeleted).toBe(saved.coverKey);
  expect(storage.deleteEventMediaObject).toHaveBeenCalledTimes(1);
  expect(storage.deleteEventMediaObject).toHaveBeenCalledWith("covers/event/old.webp");
});

it("keeps the winning image when compare-and-swap loses or storage fails", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/winner.webp" });
  await actingAdmin();

  const stale = new FormData();
  stale.set("eventId", event.id);
  stale.set("expectedKey", "");
  stale.set("image", imageFile(png));
  const staleRedirect = await redirectFrom(() => replaceEventCoverAction(stale));
  expect(staleRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=conflict`,
  });
  expect(storage.uploadEventMediaObject).not.toHaveBeenCalled();

  const updateMany = vi
    .spyOn(db.event, "updateMany")
    .mockResolvedValueOnce({ count: 0 });
  storage.deleteEventMediaObject.mockRejectedValueOnce(new Error("storage delete failed"));
  const matching = new FormData();
  matching.set("eventId", event.id);
  matching.set("expectedKey", "covers/event/winner.webp");
  matching.set("image", imageFile(png));
  const conflict = await redirectFrom(() => replaceEventCoverAction(matching));
  expect(conflict).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=conflict`,
  });
  const uploadedKey = storage.uploadEventMediaObject.mock.calls[0]?.[0];
  expect(uploadedKey).toEqual(expect.any(String));
  expect(uploadedKey).not.toBe("covers/event/winner.webp");
  expect(storage.deleteEventMediaObject).toHaveBeenCalledWith(uploadedKey);
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalledWith("covers/event/winner.webp");
  updateMany.mockRestore();

  storage.uploadEventMediaObject.mockRejectedValueOnce(new Error("storage unavailable"));
  const uploadFailure = await redirectFrom(() => replaceEventCoverAction(matching));
  expect(uploadFailure).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=storage_unavailable`,
  });

  const database = vi
    .spyOn(db.event, "updateMany")
    .mockRejectedValueOnce(new Error("database unavailable"));
  const databaseFailure = await redirectFrom(() => replaceEventCoverAction(matching));
  expect(databaseFailure).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=unavailable`,
  });
  const discarded = storage.uploadEventMediaObject.mock.calls.at(-1)?.[0];
  expect(storage.deleteEventMediaObject).toHaveBeenCalledWith(discarded);
  database.mockRestore();

  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toBe("covers/event/winner.webp");
});

it("keeps the new cover when deleting the previous object fails", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/old.webp" });
  await actingAdmin();
  storage.deleteEventMediaObject.mockRejectedValueOnce(new Error("remote delete failed"));
  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "covers/event/old.webp");
  form.set("image", imageFile(png));

  const redirected = await redirectFrom(() => replaceEventCoverAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=cleanup_failed`,
  });
  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toMatch(new RegExp(`^covers/${event.id}/`));
  expect(saved.coverKey).not.toBe("covers/event/old.webp");
});

it("clears a cover before deleting its object and does not delete on a stale confirmation", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/current.webp" });
  await actingAdmin();

  const unconfirmed = new FormData();
  unconfirmed.set("eventId", event.id);
  unconfirmed.set("expectedKey", "covers/event/current.webp");
  const unconfirmedRedirect = await redirectFrom(() => removeEventCoverAction(unconfirmed));
  expect(unconfirmedRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=invalid_input`,
  });
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();

  const stale = new FormData();
  stale.set("eventId", event.id);
  stale.set("expectedKey", "covers/event/other.webp");
  stale.set("confirm", "delete");
  const staleRedirect = await redirectFrom(() => removeEventCoverAction(stale));
  expect(staleRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=conflict`,
  });
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();

  let coverWhenDeleted: string | null = "missing";
  storage.deleteEventMediaObject.mockImplementation(async () => {
    const row = await db.event.findUnique({ where: { id: event.id }, select: { coverKey: true } });
    coverWhenDeleted = row?.coverKey ?? null;
  });
  const form = new FormData();
  form.set("eventId", event.id);
  form.set("expectedKey", "covers/event/current.webp");
  form.set("confirm", "delete");
  const redirected = await redirectFrom(() => removeEventCoverAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageSaved=1`,
  });
  expect(coverWhenDeleted).toBeNull();
  expect(storage.deleteEventMediaObject).toHaveBeenCalledWith("covers/event/current.webp");
  const saved = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.coverKey).toBeNull();
});

it("rejects a remote URL as the expected key and a host from another event", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id);
  const other = await createTestEvent(organizer.id, { slug: "other-event" });
  const host = await createHost(other.id, "avatars/other/old.webp");
  await actingAdmin();

  const remote = new FormData();
  remote.set("eventId", event.id);
  remote.set("expectedKey", "https://cdn.example/cover.webp");
  remote.set("image", imageFile(png));
  const remoteRedirect = await redirectFrom(() => replaceEventCoverAction(remote));
  expect(remoteRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/edit?imageError=invalid_input`,
  });

  const crossEvent = new FormData();
  crossEvent.set("eventId", event.id);
  crossEvent.set("hostId", host.id);
  crossEvent.set("expectedKey", "avatars/other/old.webp");
  crossEvent.set("image", imageFile(png));
  const crossRedirect = await redirectFrom(() => replaceHostAvatarAction(crossEvent));
  expect(crossRedirect).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/hosts/${host.id}?imageError=host_not_found`,
  });
  expect(storage.uploadEventMediaObject).not.toHaveBeenCalled();
  const unchanged = await db.eventHost.findUniqueOrThrow({ where: { id: host.id } });
  expect(unchanged.avatarKey).toBe("avatars/other/old.webp");
});

it("replaces a host avatar and leaves a shared previous object in place", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id);
  const sharedKey = "avatars/event/shared.webp";
  const first = await createHost(event.id, sharedKey, 0);
  const second = await createHost(event.id, sharedKey, 1);
  await actingAdmin();

  const form = new FormData();
  form.set("eventId", event.id);
  form.set("hostId", first.id);
  form.set("expectedKey", sharedKey);
  form.set("image", imageFile(png));
  const redirected = await redirectFrom(() => replaceHostAvatarAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/hosts/${first.id}?imageSaved=1`,
  });

  const updated = await db.eventHost.findUniqueOrThrow({ where: { id: first.id } });
  const other = await db.eventHost.findUniqueOrThrow({ where: { id: second.id } });
  expect(updated.avatarKey).toMatch(
    new RegExp(`^avatars/${event.id}/${first.id}/[0-9a-f-]{36}\\.webp$`),
  );
  expect(updated.avatarKey).not.toContain(event.slug);
  expect(other.avatarKey).toBe(sharedKey);
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();
});

it("deletes avatar bytes only for a removed host key that is no longer referenced", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id, { coverKey: "covers/event/cover.webp" });
  const removedKey = "avatars/event/removed.webp";
  const keptKey = "avatars/event/kept.webp";
  const removed = await createHost(event.id, removedKey, 0);
  await createHost(event.id, keptKey, 1);
  await actingAdmin();

  await expect(deleteRemovedHostAvatar(removedKey)).rejects.toMatchObject({ code: "conflict" });
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();

  const deletion = await removeEventHost(event.id, removed.id);
  expect(deletion.removedAvatarKey).toBe(removedKey);
  await deleteRemovedHostAvatar(deletion.removedAvatarKey);
  expect(storage.deleteEventMediaObject).toHaveBeenCalledTimes(1);
  expect(storage.deleteEventMediaObject).toHaveBeenCalledWith(removedKey);
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalledWith(keptKey);
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalledWith("covers/event/cover.webp");

  storage.deleteEventMediaObject.mockClear();
  await deleteRemovedHostAvatar(null);
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();

  await db.event.update({
    where: { id: event.id },
    data: { coverKey: keptKey },
  });
  await expect(deleteRemovedHostAvatar(keptKey)).rejects.toMatchObject({ code: "conflict" });
  expect(storage.deleteEventMediaObject).not.toHaveBeenCalled();
});

it("clears an avatar before deleting it and reports cleanup failure without restoring the key", async () => {
  const organizer = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(organizer.id);
  const host = await createHost(event.id, "avatars/event/old.webp");
  await actingAdmin();
  storage.deleteEventMediaObject.mockRejectedValueOnce(new Error("remote delete failed"));

  const form = new FormData();
  form.set("eventId", event.id);
  form.set("hostId", host.id);
  form.set("expectedKey", "avatars/event/old.webp");
  form.set("confirm", "delete");
  const redirected = await redirectFrom(() => removeHostAvatarAction(form));
  expect(redirected).toMatchObject({
    code: "TEST_REDIRECT",
    destination: `/admin/events/${event.id}/hosts/${host.id}?imageError=cleanup_failed`,
  });
  const saved = await db.eventHost.findUniqueOrThrow({ where: { id: host.id } });
  expect(saved.avatarKey).toBeNull();
});

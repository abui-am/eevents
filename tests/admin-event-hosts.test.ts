import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import {
  createAdminEventAction,
  updateAdminEventAction,
} from "@app/actions/admin-events";
import {
  createEventHostAction,
  moveEventHostDownAction,
  moveEventHostUpAction,
  removeEventHostAction,
  removeEventHostFormAction,
  updateEventHostAction,
} from "@app/actions/admin-hosts";
import EditEventPage from "@app/admin/events/[id]/edit/page";
import RemoveCoverPage from "@app/admin/events/[id]/cover/remove/page";
import EditHostPage from "@app/admin/events/[id]/hosts/[hostId]/page";
import RemoveAvatarPage from "@app/admin/events/[id]/hosts/[hostId]/avatar/remove/page";
import NewHostPage from "@app/admin/events/[id]/hosts/new/page";
import { db } from "@/lib/db";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import { createEventHost } from "@/services/event-host-service";
import * as storage from "@/lib/storage";
import { createTestEvent, createTestSession, createTestUser } from "./support/database";
import { setTestCookieToken } from "./support/next-mocks";

const mediaStorage = vi.hoisted(() => ({
  deleteEventMediaObject: vi.fn<(objectKey: string) => Promise<void>>(),
  downloadEventMediaObject: vi.fn(),
  uploadEventMediaObject: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getCertificateUploadEndpoint: vi.fn(),
  createCertificateSignedUrl: vi.fn(),
}));

vi.mock("@/lib/event-media-storage", () => mediaStorage);

beforeEach(() => {
  mediaStorage.deleteEventMediaObject.mockReset();
  mediaStorage.deleteEventMediaObject.mockResolvedValue(undefined);
  mediaStorage.downloadEventMediaObject.mockReset();
  mediaStorage.uploadEventMediaObject.mockReset();
});

const ADMIN_EMAIL = "admin-secret@example.test";

function eventForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("title", "Venue Workshop");
  form.set("description", "Bring a notebook.");
  form.set("location", "Old campus");
  form.set("startsAt", "2030-06-01T09:00");
  form.set("endsAt", "2030-06-01T12:00");
  form.set("capacity", "20");
  form.set("status", "DRAFT");
  form.set("venueName", "North Hall");
  form.set("venueAddress", "1 Main Street");
  form.set("mapUrl", "https://maps.example/north");
  for (const [key, fieldValue] of Object.entries(overrides)) form.set(key, fieldValue);
  return form;
}

function hostForm(eventId: string, hostId?: string, overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("eventId", eventId);
  if (hostId) form.set("hostId", hostId);
  form.set("name", "Ada Lovelace");
  form.set("biography", "Mathematician");
  form.set("publicEmail", "Ada@Host.test");
  for (const [key, fieldValue] of Object.entries(overrides)) form.set(key, fieldValue);
  return form;
}

async function redirectDestination(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_REDIRECT" });
    return (error as { destination: string }).destination;
  }
  throw new Error("Expected a redirect.");
}

async function signInAdmin() {
  const admin = await createTestUser({
    role: "ADMIN",
    email: ADMIN_EMAIL,
    name: "Admin Person",
  });
  await createTestSession(admin.id);
  return admin;
}

it("rejects anonymous and participant host changes", async () => {
  const participant = await createTestUser();
  const event = await createTestEvent(participant.id);
  const form = hostForm(event.id, "host-id");

  await expect(createEventHostAction(form)).rejects.toMatchObject({ code: "TEST_REDIRECT" });
  expect(await db.eventHost.count()).toBe(0);

  await createTestSession(participant.id);
  await expect(createEventHostAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(updateEventHostAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(moveEventHostUpAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(moveEventHostDownAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(removeEventHostAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(removeEventHostFormAction(form)).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  expect(await db.eventHost.count()).toBe(0);
});

it("saves and clears venue fields through the event actions", async () => {
  const admin = await signInAdmin();
  const createdDestination = await redirectDestination(createAdminEventAction(eventForm()));
  const created = await db.event.findFirstOrThrow({ where: { organizerId: admin.id } });
  expect(createdDestination).toBe(`/admin/events/${created.id}?saved=1`);
  expect(created).toMatchObject({
    location: "Old campus",
    venueName: "North Hall",
    venueAddress: "1 Main Street",
    mapUrl: "https://maps.example/north",
  });

  const invalid = await redirectDestination(
    updateAdminEventAction(
      eventForm({
        eventId: created.id,
        title: "Venue Workshop",
        mapUrl: "http://maps.example/north",
      }),
    ),
  );
  const invalidUrl = new URL(invalid, "http://localhost");
  expect(invalidUrl.pathname).toBe(`/admin/events/${created.id}/edit`);
  expect(invalidUrl.searchParams.get("error")).toBe("map_url");
  expect(invalidUrl.searchParams.get("mapUrl")).toBe("http://maps.example/north");
  expect(invalidUrl.searchParams.get("title")).toBe("Venue Workshop");
  expect((await db.event.findUniqueOrThrow({ where: { id: created.id } })).mapUrl).toBe(
    "https://maps.example/north",
  );

  await redirectDestination(
    updateAdminEventAction(
      eventForm({
        eventId: created.id,
        venueName: "",
        venueAddress: " ",
        mapUrl: "",
      }),
    ),
  );
  expect(await db.event.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
    location: "Old campus",
    venueName: null,
    venueAddress: null,
    mapUrl: null,
  });
});

it("keeps stored venue fields when the update form omits them", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id, {
    venueName: "North Hall",
    venueAddress: "1 Main Street",
    mapUrl: "https://maps.example/north",
    location: "Old campus",
  });
  const form = eventForm({ eventId: event.id, title: "Renamed workshop" });
  form.delete("venueName");
  form.delete("venueAddress");
  form.delete("mapUrl");

  await redirectDestination(updateAdminEventAction(form));
  expect(await db.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
    title: "Renamed workshop",
    location: "Old campus",
    venueName: "North Hall",
    venueAddress: "1 Main Street",
    mapUrl: "https://maps.example/north",
  });
});

it("adds, reorders, and edits hosts without copying the account email or avatar key", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  const created = await createEventHost(event.id, {
    name: "Grace Hopper",
    biography: "Engineer",
    publicEmail: "",
    avatarKey: "avatars/event/grace.webp",
  });

  const destination = await redirectDestination(
    createEventHostAction(hostForm(event.id, undefined, { name: "Ada Lovelace" })),
  );
  expect(destination).toContain(`/admin/events/${event.id}/edit?hostSaved=1`);
  const hosts = await db.eventHost.findMany({
    where: { eventId: event.id },
    orderBy: { displayOrder: "asc" },
  });
  expect(hosts.map((host) => host.name)).toEqual(["Grace Hopper", "Ada Lovelace"]);
  const ada = hosts[1];
  expect(ada?.publicEmail).toBe("ada@host.test");
  expect(ada?.publicEmail).not.toBe(ADMIN_EMAIL);
  expect(ada?.avatarKey).toBeNull();

  const edited = await redirectDestination(
    updateEventHostAction(
      hostForm(event.id, ada?.id, {
        name: "Ada",
        biography: "",
        publicEmail: "",
        avatarKey: "avatars/evil.webp",
      }),
    ),
  );
  expect(edited).toContain(`/hosts/${ada?.id}?saved=1`);
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: ada?.id } })).toMatchObject({
    name: "Ada",
    biography: null,
    publicEmail: null,
    avatarKey: null,
  });
  await redirectDestination(
    updateEventHostAction(
      hostForm(event.id, created.hostId, {
        name: "Grace Hopper",
        biography: "",
        publicEmail: "",
        avatarKey: "avatars/replaced.webp",
      }),
    ),
  );
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: created.hostId } })).toMatchObject({
    name: "Grace Hopper",
    biography: null,
    publicEmail: null,
    avatarKey: "avatars/event/grace.webp",
  });
  expect(
    (await db.eventHost.findUniqueOrThrow({ where: { id: created.hostId } })).publicEmail,
  ).not.toBe(ADMIN_EMAIL);

  await redirectDestination(moveEventHostUpAction(hostForm(event.id, ada?.id)));
  const reordered = await db.eventHost.findMany({
    where: { eventId: event.id },
    orderBy: { displayOrder: "asc" },
  });
  expect(reordered.map((host) => [host.displayOrder, host.name])).toEqual([
    [0, "Ada"],
    [1, "Grace Hopper"],
  ]);
});

it("preserves host input and blocks a host from another event", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  const other = await createTestEvent(admin.id, { title: "Other event" });
  const created = await createEventHost(event.id, {
    name: "Ada",
    biography: "Original",
    publicEmail: "ada@host.test",
  });

  const invalid = await redirectDestination(
    createEventHostAction(
      hostForm(event.id, undefined, {
        name: "Ken",
        biography: "Notes",
        publicEmail: "not-an-email",
      }),
    ),
  );
  const invalidUrl = new URL(invalid, "http://localhost");
  expect(invalidUrl.searchParams.get("error")).toBe("invalid_email");
  expect(invalidUrl.searchParams.get("name")).toBe("Ken");
  expect(invalidUrl.searchParams.get("biography")).toBe("Notes");
  expect(invalidUrl.searchParams.get("publicEmail")).toBe("not-an-email");
  expect(await db.eventHost.count({ where: { eventId: event.id } })).toBe(1);

  const crossEvent = await redirectDestination(
    updateEventHostAction(
      hostForm(other.id, created.hostId, { name: "Changed", biography: "Stolen" }),
    ),
  );
  expect(crossEvent).toContain("hostError=host_not_found");
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: created.hostId } })).toMatchObject({
    name: "Ada",
    biography: "Original",
    eventId: event.id,
  });
  await expect(
    moveEventHostDownAction(hostForm(other.id, created.hostId)),
  ).rejects.toMatchObject({ destination: expect.stringContaining("hostError=host_not_found") });
  await expect(
    removeEventHostAction(hostForm(other.id, created.hostId)),
  ).rejects.toMatchObject({ destination: expect.stringContaining("hostError=host_not_found") });
  expect(await db.eventHost.count({ where: { eventId: event.id } })).toBe(1);
  expect(await db.eventHost.count({ where: { eventId: other.id } })).toBe(0);
  expect(mediaStorage.deleteEventMediaObject).not.toHaveBeenCalled();
});

it("stops at 10 hosts", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  for (let index = 0; index < EVENT_CONTENT_LIMITS.maxHosts; index += 1) {
    await createEventHost(event.id, {
      name: `Host ${index}`,
      biography: "",
      publicEmail: "",
    });
  }

  const destination = await redirectDestination(
    createEventHostAction(hostForm(event.id, undefined, { name: "Extra host" })),
  );
  const url = new URL(destination, "http://localhost");
  expect(url.searchParams.get("error")).toBe("host_limit");
  expect(url.searchParams.get("name")).toBe("Extra host");
  expect(await db.eventHost.count({ where: { eventId: event.id } })).toBe(10);
});

it("deletes only the removed host avatar after the row is gone", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  const kept = await createEventHost(event.id, {
    name: "Grace",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/grace.webp",
  });
  const removedHost = await createEventHost(event.id, {
    name: "Ada",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/ada.webp",
  });

  const removed = await removeEventHostAction(hostForm(event.id, removedHost.hostId));
  expect(removed).toEqual({ removedAvatarKey: "avatars/event/ada.webp" });
  expect(mediaStorage.deleteEventMediaObject).toHaveBeenCalledTimes(1);
  expect(mediaStorage.deleteEventMediaObject).toHaveBeenCalledWith("avatars/event/ada.webp");
  expect(mediaStorage.deleteEventMediaObject).not.toHaveBeenCalledWith("avatars/event/grace.webp");
  expect(storage.createCertificateSignedUrl).not.toHaveBeenCalled();
  expect(storage.getCertificateUploadEndpoint).not.toHaveBeenCalled();
  expect(await db.eventHost.findUnique({ where: { id: removedHost.hostId } })).toBeNull();
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: kept.hostId } })).toMatchObject({
    avatarKey: "avatars/event/grace.webp",
    displayOrder: 0,
  });

  const formDestination = await redirectDestination(
    removeEventHostFormAction(hostForm(event.id, kept.hostId)),
  );
  expect(formDestination).toContain(`/admin/events/${event.id}/edit?hostSaved=1`);
  expect(formDestination).not.toContain("imageError");
  expect(mediaStorage.deleteEventMediaObject).toHaveBeenCalledWith("avatars/event/grace.webp");
  expect(await db.eventHost.findUnique({ where: { id: kept.hostId } })).toBeNull();
  expect(storage.createCertificateSignedUrl).not.toHaveBeenCalled();
  expect(storage.getCertificateUploadEndpoint).not.toHaveBeenCalled();

  const other = await createTestEvent(admin.id, { title: "Second event" });
  const otherHost = await createEventHost(other.id, {
    name: "Other",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/other.webp",
  });
  const destination = await redirectDestination(
    removeEventHostFormAction(hostForm(event.id, otherHost.hostId)),
  );
  expect(destination).toContain("hostError=host_not_found");
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: otherHost.hostId } })).toMatchObject({
    avatarKey: "avatars/event/other.webp",
  });
  expect(mediaStorage.deleteEventMediaObject).not.toHaveBeenCalledWith("avatars/event/other.webp");
  expect(storage.createCertificateSignedUrl).not.toHaveBeenCalled();
});

it("keeps an avatar that another host still references", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  const sharedKey = "avatars/event/shared.webp";
  const removedHost = await createEventHost(event.id, {
    name: "Ada",
    biography: "",
    publicEmail: "",
    avatarKey: sharedKey,
  });
  const kept = await createEventHost(event.id, {
    name: "Grace",
    biography: "",
    publicEmail: "",
    avatarKey: sharedKey,
  });

  const removed = await removeEventHostAction(hostForm(event.id, removedHost.hostId));
  expect(removed).toEqual({ removedAvatarKey: sharedKey });
  expect(mediaStorage.deleteEventMediaObject).not.toHaveBeenCalled();
  expect(await db.eventHost.findUniqueOrThrow({ where: { id: kept.hostId } })).toMatchObject({
    avatarKey: sharedKey,
  });
});

it("reports avatar cleanup failure after the host row is gone", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id);
  const host = await createEventHost(event.id, {
    name: "Ada",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/ada.webp",
  });
  mediaStorage.deleteEventMediaObject.mockRejectedValueOnce(new Error("remote delete failed"));

  const destination = await redirectDestination(
    removeEventHostFormAction(hostForm(event.id, host.hostId)),
  );
  expect(destination).toContain("hostSaved=1");
  expect(destination).toContain("imageError=cleanup_failed");
  expect(await db.eventHost.findUnique({ where: { id: host.hostId } })).toBeNull();
});

it("renders venue fields, ordered hosts, and image forms without host contact", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id, {
    title: "Rendered workshop",
    venueName: "North Hall",
    mapUrl: "https://maps.example/north",
    coverKey: "covers/event/north.webp",
  });
  await createEventHost(event.id, {
    name: "Ada Lovelace",
    biography: "Secret biography text",
    publicEmail: "public-host@example.test",
    avatarKey: "avatars/event/secret.webp",
  });
  await createEventHost(event.id, {
    name: "Grace Hopper",
    biography: "Second biography",
    publicEmail: "",
  });

  const editMarkup = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(editMarkup).toContain("Map URL (HTTPS only)");
  expect(editMarkup).toContain("name=\"venueName\"");
  expect(editMarkup).toContain("name=\"location\"");
  expect(editMarkup.indexOf("Ada Lovelace")).toBeLessThan(editMarkup.indexOf("Grace Hopper"));
  expect(editMarkup).not.toContain("Secret biography text");
  expect(editMarkup).not.toContain("public-host@example.test");
  expect(editMarkup).not.toContain("avatars/event/secret.webp");
  expect(editMarkup).not.toContain(ADMIN_EMAIL);
  expect(editMarkup).toContain("type=\"file\"");
  expect(editMarkup).toContain("name=\"image\"");
  expect(editMarkup).toContain("name=\"expectedKey\"");
  expect(editMarkup).toContain("value=\"covers/event/north.webp\"");
  expect(editMarkup).toContain(`src="/events/${event.slug}/cover"`);
  expect(editMarkup).toContain("JPEG, PNG, or WebP up to 2 MiB.");
  expect(editMarkup).toContain(`/admin/events/${event.id}/cover/remove`);
  expect(editMarkup).not.toContain("/_next/image");
  expect(editMarkup).not.toContain("type=\"url\"");
  expect(editMarkup).not.toContain("name=\"biography\"");
  expect(editMarkup).not.toContain("name=\"publicEmail\"");
  expect(editMarkup).toContain(">Move up");
  expect(editMarkup).toContain(">Move down");
  expect(editMarkup).toContain(">Remove");

  const host = await db.eventHost.findFirstOrThrow({
    where: { eventId: event.id, name: "Ada Lovelace" },
  });
  const hostMarkup = renderToStaticMarkup(
    await EditHostPage({
      params: Promise.resolve({ id: event.id, hostId: host.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(hostMarkup).toContain("Public email (publicly visible)");
  expect(hostMarkup).toContain("Anyone who can view this event can see this address.");
  expect(hostMarkup).toContain("public-host@example.test");
  expect(hostMarkup).toContain("Secret biography text");
  expect(hostMarkup).not.toContain(ADMIN_EMAIL);
  expect(hostMarkup).toContain("type=\"file\"");
  expect(hostMarkup).toContain("name=\"image\"");
  expect(hostMarkup).toContain("name=\"expectedKey\"");
  expect(hostMarkup).toContain("value=\"avatars/event/secret.webp\"");
  expect(hostMarkup).toContain(`src="/events/${event.slug}/hosts/${host.id}/avatar"`);
  expect(hostMarkup).not.toContain("src=\"avatars/event/secret.webp\"");
  expect(hostMarkup).toContain("JPEG, PNG, or WebP up to 2 MiB.");
  expect(hostMarkup).toContain(`/admin/events/${event.id}/hosts/${host.id}/avatar/remove`);
  expect(hostMarkup).not.toContain("/_next/image");
  expect(hostMarkup).not.toContain("type=\"url\"");

  const newMarkup = renderToStaticMarkup(
    await NewHostPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({
        error: "invalid_email",
        name: "Kept name",
        biography: "Kept biography",
        publicEmail: "not-an-email",
      }),
    }),
  );
  expect(newMarkup).toContain("Kept name");
  expect(newMarkup).toContain("Kept biography");
  expect(newMarkup).toContain("not-an-email");
  expect(newMarkup).toContain("Enter a valid email address, or leave public email blank.");
  expect(newMarkup).not.toContain(ADMIN_EMAIL);
  expect(newMarkup).not.toContain("type=\"file\"");
  expect(newMarkup).not.toContain("type=\"url\"");
});

it("shows image results and asks before deleting a cover or avatar", async () => {
  const admin = await signInAdmin();
  const event = await createTestEvent(admin.id, {
    title: "North Gathering",
    coverKey: "covers/event/north.webp",
  });
  const host = await createEventHost(event.id, {
    name: "Ada Lovelace",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/ada.webp",
  });

  const invalid = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ imageError: "invalid_input" }),
    }),
  );
  expect(invalid).toContain("Use a JPEG, PNG, or WebP image up to 2 MB.");

  const unavailable = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ imageError: "storage_unavailable" }),
    }),
  );
  expect(unavailable).toContain("Image storage is unavailable. The current image was kept.");

  const conflict = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ imageError: "conflict" }),
    }),
  );
  expect(conflict).toContain("The image changed while you were saving. Reload and try again.");
  expect(conflict).not.toContain("Cover image saved.");

  const cleanup = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ imageError: "cleanup_failed", hostSaved: "1" }),
    }),
  );
  expect(cleanup).toContain("The image reference was saved, but an unused file could not be deleted.");
  expect(cleanup).toContain("Hosts updated.");

  const saved = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: event.id }),
      searchParams: Promise.resolve({ imageSaved: "1" }),
    }),
  );
  expect(saved).toContain("Cover image saved.");

  const hostConflict = renderToStaticMarkup(
    await EditHostPage({
      params: Promise.resolve({ id: event.id, hostId: host.hostId }),
      searchParams: Promise.resolve({ imageError: "conflict" }),
    }),
  );
  expect(hostConflict).toContain("The image changed while you were saving. Reload and try again.");

  const hostSaved = renderToStaticMarkup(
    await EditHostPage({
      params: Promise.resolve({ id: event.id, hostId: host.hostId }),
      searchParams: Promise.resolve({ imageSaved: "1" }),
    }),
  );
  expect(hostSaved).toContain("Avatar saved.");

  const removeCover = renderToStaticMarkup(
    await RemoveCoverPage({ params: Promise.resolve({ id: event.id }) }),
  );
  expect(removeCover).toContain("North Gathering");
  expect(removeCover).toContain("will be deleted");
  expect(removeCover).toContain("name=\"confirm\"");
  expect(removeCover).toContain("value=\"delete\"");
  expect(removeCover).toContain("value=\"covers/event/north.webp\"");
  expect(removeCover).toContain(`/admin/events/${event.id}/edit`);

  const removeAvatar = renderToStaticMarkup(
    await RemoveAvatarPage({
      params: Promise.resolve({ id: event.id, hostId: host.hostId }),
    }),
  );
  expect(removeAvatar).toContain("Ada Lovelace");
  expect(removeAvatar).toContain("will be deleted");
  expect(removeAvatar).toContain("value=\"avatars/event/ada.webp\"");
  expect(removeAvatar).toContain(`/admin/events/${event.id}/hosts/${host.hostId}`);

  const bare = await createTestEvent(admin.id, { title: "No art" });
  const bareMarkup = renderToStaticMarkup(
    await EditEventPage({
      params: Promise.resolve({ id: bare.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(bareMarkup).toContain("Upload cover");
  expect(bareMarkup).toContain("name=\"expectedKey\" value=\"\"");
  expect(bareMarkup).toContain("JPEG, PNG, or WebP up to 2 MiB.");
  expect(bareMarkup).not.toContain("/cover/remove");
  await expect(
    RemoveCoverPage({ params: Promise.resolve({ id: bare.id }) }),
  ).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });

  const other = await createTestEvent(admin.id, { title: "Other event" });
  const otherHost = await createEventHost(other.id, {
    name: "Grace",
    biography: "",
    publicEmail: "",
    avatarKey: "avatars/event/other.webp",
  });
  await expect(
    RemoveAvatarPage({
      params: Promise.resolve({ id: event.id, hostId: otherHost.hostId }),
    }),
  ).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });

  setTestCookieToken(null);
  await expect(
    RemoveCoverPage({ params: Promise.resolve({ id: event.id }) }),
  ).rejects.toMatchObject({ code: "TEST_REDIRECT", destination: "/login" });

  const participant = await createTestUser();
  await createTestSession(participant.id);
  await expect(
    RemoveAvatarPage({
      params: Promise.resolve({ id: event.id, hostId: host.hostId }),
    }),
  ).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
});

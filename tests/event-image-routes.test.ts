import { beforeEach, expect, it, vi } from "vitest";
import EventPage from "@app/events/[slug]/page";
import {
  GET as getAvatar,
  dynamic as avatarDynamic,
  runtime as avatarRuntime,
} from "@app/events/[slug]/hosts/[hostId]/avatar/route";
import {
  GET as getCover,
  dynamic as coverDynamic,
  runtime as coverRuntime,
} from "@app/events/[slug]/cover/route";
import { db } from "@/lib/db";
import { EVENT_MEDIA_BUCKET } from "@/lib/event-media-contract";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";
import { setTestCookieToken } from "./support/next-mocks";

const WEBP = Buffer.from("RIFFxxxxWEBPVP8 ");
const COVER_KEY = "covers/event/public.webp";
const AVATAR_KEY = "avatars/event/ada.webp";
const OTHER_AVATAR_KEY = "avatars/event/other.webp";

const download = vi.hoisted(() => vi.fn());
const createSignedUrl = vi.hoisted(() => vi.fn());
const buckets = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/storage", () => ({
  getServiceRoleStorageClient: () => ({
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return { download, createSignedUrl };
      },
    },
  }),
  createCertificateSignedUrl: vi.fn(),
  getCertificateUploadEndpoint: vi.fn(),
}));

beforeEach(() => {
  download.mockReset();
  createSignedUrl.mockReset();
  buckets.length = 0;
  download.mockResolvedValue({
    data: new Blob([new Uint8Array(WEBP)]),
    error: null,
  });
});

function coverRequest(slug: string, query = ""): Request {
  return new Request(`https://eevents.example/events/${slug}/cover${query}`);
}

function avatarRequest(slug: string, hostId: string, query = ""): Request {
  return new Request(
    `https://eevents.example/events/${slug}/hosts/${hostId}/avatar${query}`,
  );
}

async function expectWebp(response: Response, cacheControl: string): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toBe(cacheControl);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("location")).toBeNull();
  expect(Buffer.from(await response.arrayBuffer())).toEqual(WEBP);
  expect(createSignedUrl).not.toHaveBeenCalled();
  expect(buckets.at(-1)).toBe(EVENT_MEDIA_BUCKET);
}

function expectMissing(response: Response): void {
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("text/plain");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("location")).toBeNull();
}

async function createHost(eventId: string, avatarKey: string | null) {
  return db.eventHost.create({
    data: {
      eventId,
      name: "Ada Lovelace",
      displayOrder: 0,
      avatarKey,
    },
  });
}

it("serves published and cancelled covers without a signed URL", async () => {
  expect(coverDynamic).toBe("force-dynamic");
  expect(coverRuntime).toBe("nodejs");

  const organizer = await createTestUser({ role: "ADMIN" });
  const published = await createTestEvent(organizer.id, {
    slug: "public-cover",
    coverKey: COVER_KEY,
  });
  const cancelled = await createTestEvent(organizer.id, {
    title: "Cancelled gathering",
    slug: "cancelled-cover",
    status: "CANCELLED",
    coverKey: COVER_KEY,
  });

  const anonymous = await getCover(coverRequest(published.slug, "?key=covers/stolen.webp"), {
    params: Promise.resolve({ slug: published.slug }),
  });
  await expectWebp(anonymous, "private, max-age=60");
  expect(download).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith(COVER_KEY);
  expect(JSON.stringify(download.mock.calls)).not.toContain("stolen");

  const participant = await createTestUser();
  await createTestSession(participant.id);
  const participantResponse = await getCover(coverRequest(cancelled.slug), {
    params: Promise.resolve({ slug: cancelled.slug }),
  });
  await expectWebp(participantResponse, "private, max-age=60");
  expect(download).toHaveBeenLastCalledWith(COVER_KEY);

  await createTestSession(organizer.id);
  const adminResponse = await getCover(coverRequest(published.slug), {
    params: Promise.resolve({ slug: published.slug }),
  });
  await expectWebp(adminResponse, "no-store");
  expect(download).toHaveBeenLastCalledWith(COVER_KEY);
});

it("hides draft covers from non-admins and missing objects", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const draft = await createTestEvent(admin.id, {
    slug: "draft-cover",
    status: "DRAFT",
    coverKey: COVER_KEY,
  });
  await createTestSession(admin.id);

  await expect(
    EventPage({
      params: Promise.resolve({ slug: draft.slug }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });

  const adminResponse = await getCover(coverRequest(draft.slug), {
    params: Promise.resolve({ slug: draft.slug }),
  });
  await expectWebp(adminResponse, "no-store");
  expect(download).toHaveBeenCalledWith(COVER_KEY);

  download.mockClear();
  buckets.length = 0;
  const participant = await createTestUser();
  await createTestSession(participant.id);
  const hidden = await getCover(coverRequest(draft.slug, "?key=covers/stolen.webp"), {
    params: Promise.resolve({ slug: draft.slug }),
  });
  expectMissing(hidden);
  expect(download).not.toHaveBeenCalled();

  setTestCookieToken(null);
  const anonymous = await getCover(coverRequest(draft.slug), {
    params: Promise.resolve({ slug: draft.slug }),
  });
  expectMissing(anonymous);
  expect(download).not.toHaveBeenCalled();

  const published = await createTestEvent(admin.id, {
    slug: "missing-cover",
    coverKey: null,
  });
  const absentKey = await getCover(coverRequest(published.slug), {
    params: Promise.resolve({ slug: published.slug }),
  });
  expectMissing(absentKey);
  expect(download).not.toHaveBeenCalled();

  await db.event.update({
    where: { id: published.id },
    data: { coverKey: COVER_KEY },
  });
  download.mockResolvedValueOnce({
    data: null,
    error: { message: "Object not found", statusCode: "404" },
  });
  const missingObject = await getCover(coverRequest(published.slug), {
    params: Promise.resolve({ slug: published.slug }),
  });
  expectMissing(missingObject);
  expect(download).toHaveBeenCalledWith(COVER_KEY);

  const callsAfterMissingObject = download.mock.calls.length;
  const unknown = await getCover(coverRequest("missing-event"), {
    params: Promise.resolve({ slug: "missing-event" }),
  });
  expectMissing(unknown);
  expect(download).toHaveBeenCalledTimes(callsAfterMissingObject);
});

it("serves a host avatar only for that event", async () => {
  expect(avatarDynamic).toBe("force-dynamic");
  expect(avatarRuntime).toBe("nodejs");

  const admin = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(admin.id, { slug: "avatar-event", coverKey: COVER_KEY });
  const host = await createHost(event.id, AVATAR_KEY);
  const other = await createTestEvent(admin.id, { title: "Other", slug: "other-event" });
  const otherHost = await createHost(other.id, OTHER_AVATAR_KEY);

  const published = await getAvatar(
    avatarRequest(event.slug, host.id, `?key=${OTHER_AVATAR_KEY}`),
    { params: Promise.resolve({ slug: event.slug, hostId: host.id }) },
  );
  await expectWebp(published, "private, max-age=60");
  expect(download).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith(AVATAR_KEY);
  expect(download).not.toHaveBeenCalledWith(OTHER_AVATAR_KEY);

  await createTestSession(admin.id);
  const adminResponse = await getAvatar(avatarRequest(event.slug, host.id), {
    params: Promise.resolve({ slug: event.slug, hostId: host.id }),
  });
  await expectWebp(adminResponse, "no-store");

  download.mockClear();
  const crossed = await getAvatar(avatarRequest(event.slug, otherHost.id), {
    params: Promise.resolve({ slug: event.slug, hostId: otherHost.id }),
  });
  expectMissing(crossed);
  expect(download).not.toHaveBeenCalled();

  const draft = await createTestEvent(admin.id, {
    title: "Draft hosts",
    slug: "draft-hosts",
    status: "DRAFT",
  });
  const draftHost = await createHost(draft.id, AVATAR_KEY);
  const draftAdmin = await getAvatar(avatarRequest(draft.slug, draftHost.id), {
    params: Promise.resolve({ slug: draft.slug, hostId: draftHost.id }),
  });
  await expectWebp(draftAdmin, "no-store");

  download.mockClear();
  setTestCookieToken(null);
  const draftPublic = await getAvatar(avatarRequest(draft.slug, draftHost.id), {
    params: Promise.resolve({ slug: draft.slug, hostId: draftHost.id }),
  });
  expectMissing(draftPublic);
  expect(download).not.toHaveBeenCalled();
});

it("returns 503 when image storage fails and does not leak the storage error", async () => {
  const organizer = await createTestUser();
  const event = await createTestEvent(organizer.id, {
    slug: "storage-down",
    coverKey: COVER_KEY,
  });
  download.mockResolvedValue({
    data: null,
    error: { message: "service-role-test-key", statusCode: "500" },
  });

  const response = await getCover(coverRequest(event.slug), {
    params: Promise.resolve({ slug: event.slug }),
  });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("content-type")).toContain("text/plain");
  expect(await response.text()).toBe("Image storage is unavailable.");
  expect(createSignedUrl).not.toHaveBeenCalled();
});

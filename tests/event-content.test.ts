import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  EVENT_CONTENT_LIMITS,
  hostInputSchema,
  mapUrlValueSchema,
} from "@/lib/validation";
import { getAdminEvent, saveAdminEvent } from "@/services/admin-event-service";
import {
  EVENT_CONTENT_PAGE_SIZE,
  getVisibleEventContent,
  listMyEventRows,
  listUpcomingEventRows,
} from "@/services/event-content-service";
import {
  createEventHost,
  moveEventHostDown,
  moveEventHostUp,
  removeEventHost,
  updateEventHost,
} from "@/services/event-host-service";
import { getTicketPresentation } from "@/services/ticket-service";
import { createTestEvent, createTestUser } from "./support/database";

function futureEventInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Venue Workshop",
    description: "Bring a notebook.",
    location: "Old campus",
    startsAt: "2030-06-01T09:00",
    endsAt: "2030-06-01T12:00",
    capacity: "20",
    status: "PUBLISHED",
    ...overrides,
  };
}

function hostInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    biography: "Mathematician",
    publicEmail: "Ada@Example.test",
    ...overrides,
  };
}

async function expectPacked(eventId: string, names: string[]) {
  const hosts = await db.eventHost.findMany({
    where: { eventId },
    orderBy: { displayOrder: "asc" },
  });
  expect(hosts.map((host) => [host.displayOrder, host.name])).toEqual(
    names.map((name, index) => [index, name]),
  );
}

describe("event content migration", () => {
  it("keeps existing events valid and locks EventHost to the server connection", async () => {
    const migration = readFileSync(
      "prisma/migrations/20261002100000_event_venue_and_hosts/migration.sql",
      "utf8",
    );
    expect(migration).toContain('ALTER TABLE public."EventHost" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.\"EventHost\" FROM %I",
    );
    expect(migration).toContain("'anon', 'authenticated'");
    expect(migration).not.toMatch(/CREATE POLICY/i);

    const columns = await db.$queryRaw<
      Array<{
        column_name: string;
        is_nullable: string;
        character_maximum_length: number | null;
      }>
    >`
      SELECT column_name, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Event'
        AND column_name IN ('coverKey', 'venueName', 'venueAddress', 'mapUrl', 'location', 'description')
    `;
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    expect(byName.get("coverKey")).toMatchObject({
      is_nullable: "YES",
      character_maximum_length: 300,
    });
    expect(byName.get("venueName")).toMatchObject({
      is_nullable: "YES",
      character_maximum_length: 160,
    });
    expect(byName.get("venueAddress")).toMatchObject({
      is_nullable: "YES",
      character_maximum_length: 300,
    });
    expect(byName.get("mapUrl")).toMatchObject({
      is_nullable: "YES",
      character_maximum_length: 1000,
    });
    expect(byName.get("location")?.character_maximum_length).toBe(200);
    expect(byName.get("description")?.is_nullable).toBe("NO");

    const [security] = await db.$queryRaw<Array<{ enabled: boolean; policies: number }>>`
      SELECT
        c.relrowsecurity AS enabled,
        (
          SELECT COUNT(*)::int
          FROM pg_policy
          WHERE polrelid = c.oid
        ) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'EventHost'
    `;
    expect(security).toEqual({ enabled: true, policies: 0 });

    const [foreignKey] = await db.$queryRaw<Array<{ delete_action: string }>>`
      SELECT confdeltype::text AS delete_action
      FROM pg_constraint
      WHERE conname = 'EventHost_eventId_fkey'
    `;
    expect(foreignKey?.delete_action).toBe("c");

    const organizer = await createTestUser({ role: "ADMIN" });
    const id = `legacy${randomBytes(8).toString("hex")}`;
    const slug = `legacy-${randomBytes(4).toString("hex")}`;
    const startsAt = new Date("2032-01-01T09:00:00.000Z");
    const endsAt = new Date("2032-01-01T12:00:00.000Z");
    await db.$executeRaw`
      INSERT INTO "Event" (
        "id", "organizerId", "title", "slug", "description", "location",
        "startsAt", "endsAt", "capacity", "status", "createdAt", "updatedAt"
      ) VALUES (
        ${id},
        ${organizer.id},
        'Legacy workshop',
        ${slug},
        'Existing description',
        'Existing location',
        ${startsAt},
        ${endsAt},
        12,
        ${Prisma.raw(`'PUBLISHED'::"EventStatus"`)},
        NOW(),
        NOW()
      )
    `;

    const legacy = await db.event.findUniqueOrThrow({ where: { id } });
    expect(legacy).toMatchObject({
      description: "Existing description",
      location: "Existing location",
      coverKey: null,
      venueName: null,
      venueAddress: null,
      mapUrl: null,
    });

    await createEventHost(id, hostInput({ name: "Legacy host", publicEmail: "", biography: "" }));
    await db.event.delete({ where: { id } });
    expect(await db.eventHost.count({ where: { eventId: id } })).toBe(0);
  });
});

describe("event venue validation", () => {
  it("accepts only bounded HTTPS map links and can clear optional venue fields", async () => {
    expect(mapUrlValueSchema.safeParse("https://maps.example/place").success).toBe(true);
    expect(mapUrlValueSchema.safeParse("HTTPS://maps.example/place").success).toBe(true);
    expect(mapUrlValueSchema.safeParse("").data).toBeNull();
    expect(mapUrlValueSchema.safeParse("http://maps.example/place").success).toBe(false);
    expect(mapUrlValueSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(mapUrlValueSchema.safeParse(`https://maps.example/${"a".repeat(1000)}`).success).toBe(
      false,
    );

    const longName = "N".repeat(EVENT_CONTENT_LIMITS.venueName + 1);
    await expect(
      saveAdminEvent("unused-admin", null, futureEventInput({ venueName: longName })),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await db.event.count({ where: { title: "Venue Workshop" } })).toBe(0);

    const admin = await createTestUser({ role: "ADMIN" });
    const created = await saveAdminEvent(
      admin.id,
      null,
      futureEventInput({
        venueName: "North Hall",
        venueAddress: "1 Main Street",
        mapUrl: "https://maps.example/north",
      }),
    );
    const saved = await db.event.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved).toMatchObject({
      description: "Bring a notebook.",
      location: "Old campus",
      venueName: "North Hall",
      venueAddress: "1 Main Street",
      mapUrl: "https://maps.example/north",
      coverKey: null,
    });

    await expect(
      saveAdminEvent(
        admin.id,
        created.id,
        futureEventInput({ mapUrl: "http://maps.example/north" }),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: created.id } })).mapUrl,
    ).toBe("https://maps.example/north");

    await saveAdminEvent(admin.id, created.id, futureEventInput({ title: "Venue Workshop" }));
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: created.id } })).venueName,
    ).toBe("North Hall");

    await saveAdminEvent(
      admin.id,
      created.id,
      futureEventInput({
        venueName: "",
        venueAddress: " ",
        mapUrl: "",
      }),
    );
    expect(await db.event.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      description: "Bring a notebook.",
      location: "Old campus",
      venueName: null,
      venueAddress: null,
      mapUrl: null,
    });
  });
});

describe("event hosts", () => {
  it("rejects invalid host fields before writing", async () => {
    expect(
      hostInputSchema.safeParse(hostInput({ name: "A".repeat(EVENT_CONTENT_LIMITS.hostName) }))
        .success,
    ).toBe(true);
    expect(
      hostInputSchema.safeParse(
        hostInput({ name: "A".repeat(EVENT_CONTENT_LIMITS.hostName + 1) }),
      ).success,
    ).toBe(false);
    expect(
      hostInputSchema.safeParse(
        hostInput({ biography: "B".repeat(EVENT_CONTENT_LIMITS.biography + 1) }),
      ).success,
    ).toBe(false);
    expect(hostInputSchema.safeParse(hostInput({ publicEmail: "not-an-email" })).success).toBe(
      false,
    );
    expect(
      hostInputSchema.safeParse(
        hostInput({ avatarKey: "https://cdn.example/avatar.webp?token=secret" }),
      ).success,
    ).toBe(false);

    const admin = await createTestUser({ role: "ADMIN" });
    const event = await createTestEvent(admin.id);
    await expect(
      createEventHost(event.id, hostInput({ publicEmail: "not-an-email" })),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await db.eventHost.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("packs order after add, swap, and delete and stops at 10 hosts", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const event = await createTestEvent(admin.id);
    const ada = await createEventHost(
      event.id,
      hostInput({
        name: "Ada",
        publicEmail: "Ada@Example.test",
        biography: "",
        avatarKey: "avatars/event/ada.webp",
      }),
    );
    const grace = await createEventHost(
      event.id,
      hostInput({
        name: "Grace",
        publicEmail: "",
        biography: "Engineer",
        avatarKey: "avatars/event/grace.webp",
      }),
    );
    const ken = await createEventHost(
      event.id,
      hostInput({ name: "Ken", publicEmail: null, biography: null }),
    );
    expect(ada.hosts.map((host) => host.displayOrder)).toEqual([0]);
    await expectPacked(event.id, ["Ada", "Grace", "Ken"]);
    expect(ada.hosts[0]).toMatchObject({
      publicEmail: "ada@example.test",
      avatarKey: "avatars/event/ada.webp",
    });

    await moveEventHostDown(event.id, ada.hostId);
    await moveEventHostUp(event.id, ken.hostId);
    await moveEventHostDown(event.id, ada.hostId);
    await moveEventHostUp(event.id, grace.hostId);
    await expectPacked(event.id, ["Grace", "Ken", "Ada"]);

    const cleared = await updateEventHost(event.id, grace.hostId, {
      name: "Grace Hopper",
      biography: "",
      publicEmail: "",
    });
    expect(cleared.host).toMatchObject({
      name: "Grace Hopper",
      biography: null,
      publicEmail: null,
      avatarKey: "avatars/event/grace.webp",
      displayOrder: 0,
    });

    const removed = await removeEventHost(event.id, ken.hostId);
    expect(removed.removedAvatarKey).toBeNull();
    expect(removed.hosts.map((host) => host.avatarKey)).toEqual([
      "avatars/event/grace.webp",
      "avatars/event/ada.webp",
    ]);
    await expectPacked(event.id, ["Grace Hopper", "Ada"]);

    await db.eventHost.deleteMany({ where: { eventId: event.id } });
    for (let index = 0; index < EVENT_CONTENT_LIMITS.maxHosts; index += 1) {
      await createEventHost(
        event.id,
        hostInput({ name: `Host ${index}`, publicEmail: "", biography: "" }),
      );
    }
    await expect(
      createEventHost(event.id, hostInput({ name: "Extra", publicEmail: "", biography: "" })),
    ).rejects.toMatchObject({ code: "host_limit" });
    await expectPacked(
      event.id,
      Array.from({ length: EVENT_CONTENT_LIMITS.maxHosts }, (_, index) => `Host ${index}`),
    );
  });

  it("rejects host changes that target a different event", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const event = await createTestEvent(admin.id);
    const other = await createTestEvent(admin.id, { title: "Other event" });
    const created = await createEventHost(
      event.id,
      hostInput({ name: "Ada", publicEmail: "", biography: "Original" }),
    );
    await createEventHost(
      other.id,
      hostInput({ name: "Other host", publicEmail: "", biography: "" }),
    );

    await expect(
      updateEventHost(other.id, created.hostId, hostInput({ name: "Changed" })),
    ).rejects.toMatchObject({ code: "host_not_found" });
    await expect(moveEventHostUp(other.id, created.hostId)).rejects.toMatchObject({
      code: "host_not_found",
    });
    await expect(moveEventHostDown(other.id, created.hostId)).rejects.toMatchObject({
      code: "host_not_found",
    });
    await expect(removeEventHost(other.id, created.hostId)).rejects.toMatchObject({
      code: "host_not_found",
    });
    await expect(createEventHost("missing-event", hostInput())).rejects.toMatchObject({
      code: "event_not_found",
    });

    await expectPacked(event.id, ["Ada"]);
    await expectPacked(other.id, ["Other host"]);
    expect(
      (await db.eventHost.findUniqueOrThrow({ where: { id: created.hostId } })).biography,
    ).toBe("Original");
  });
});

describe("event content queries", () => {
  it("returns ordered hosts on the detail and only the first host name on lists", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const participant = await createTestUser({ email: "participant@example.test" });
    const someoneElse = await createTestUser();
    const event = await createTestEvent(admin.id, {
      slug: "north-hall-workshop",
      location: "Old campus",
      venueName: "North Hall",
      venueAddress: "1 Secret Street",
      mapUrl: "https://maps.example/secret",
      coverKey: "covers/event/north.webp",
      startsAt: new Date("2031-01-01T09:00:00.000Z"),
      endsAt: new Date("2031-01-01T12:00:00.000Z"),
    });
    await createEventHost(event.id, {
      name: "Ada",
      biography: "First host",
      publicEmail: "ada@example.test",
      avatarKey: "avatars/event/ada.webp",
    });
    await createEventHost(event.id, {
      name: "Grace",
      biography: "Second host",
      publicEmail: "grace@example.test",
      avatarKey: "avatars/event/grace.webp",
    });
    const draft = await createTestEvent(admin.id, {
      status: "DRAFT",
      slug: "hidden-draft",
      venueName: "Draft Hall",
    });
    await createEventHost(draft.id, hostInput({ name: "Draft host", publicEmail: "draft@example.test" }));
    const cancelled = await createTestEvent(admin.id, {
      status: "CANCELLED",
      slug: "cancelled-workshop",
      location: "Cancelled room",
      startsAt: new Date("2031-02-01T09:00:00.000Z"),
      endsAt: new Date("2031-02-01T12:00:00.000Z"),
    });
    await db.event.createMany({
      data: Array.from({ length: EVENT_CONTENT_PAGE_SIZE }, (_, index) => {
        const startsAt = new Date(Date.UTC(2031, 0, index + 2, 9, 0, 0));
        return {
          organizerId: admin.id,
          title: `Paged ${index}`,
          slug: `paged-${index}-${randomBytes(3).toString("hex")}`,
          description: "Paged event",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          capacity: 10,
          status: "PUBLISHED" as const,
        };
      }),
    });
    await db.registration.create({
      data: { userId: participant.id, eventId: event.id, status: "CONFIRMED" },
    });

    const detail = await getVisibleEventContent(event.slug);
    expect(detail?.hosts.map((host) => [host.displayOrder, host.name, host.publicEmail])).toEqual([
      [0, "Ada", "ada@example.test"],
      [1, "Grace", "grace@example.test"],
    ]);
    expect(detail).toMatchObject({
      description: "An event for an integration test.",
      location: "Old campus",
      venueName: "North Hall",
      venueAddress: "1 Secret Street",
      mapUrl: "https://maps.example/secret",
      place: "North Hall",
      coverKey: "covers/event/north.webp",
    });
    expect(await getVisibleEventContent(draft.slug)).toBeNull();
    expect(await getVisibleEventContent(cancelled.slug)).toMatchObject({
      place: "Cancelled room",
      status: "CANCELLED",
    });

    const adminEvent = await getAdminEvent(event.id);
    expect(adminEvent?.hosts.map((host) => host.name)).toEqual(["Ada", "Grace"]);
    expect(adminEvent?.venueAddress).toBe("1 Secret Street");

    const listed = await listUpcomingEventRows(1, new Date("2030-01-01T00:00:00.000Z"));
    expect(listed.total).toBe(EVENT_CONTENT_PAGE_SIZE + 1);
    expect(listed.events).toHaveLength(EVENT_CONTENT_PAGE_SIZE);
    expect(listed.pageCount).toBe(2);
    const first = listed.events[0];
    expect(first).toMatchObject({
      slug: event.slug,
      hostName: "Ada",
      venueName: "North Hall",
      location: "Old campus",
      place: "North Hall",
      coverKey: "covers/event/north.webp",
    });
    const listedJson = JSON.stringify(listed);
    expect(listedJson).not.toContain("ada@example.test");
    expect(listedJson).not.toContain("grace@example.test");
    expect(listedJson).not.toContain("Grace");
    expect(listedJson).not.toContain("1 Secret Street");
    expect(listedJson).not.toContain("https://maps.example/secret");
    expect(listedJson).not.toContain("hidden-draft");
    expect(listedJson).not.toContain("cancelled-workshop");
    expect(listedJson).not.toContain("token=");
    const secondPage = await listUpcomingEventRows(2, new Date("2030-01-01T00:00:00.000Z"));
    expect(secondPage.events).toHaveLength(1);

    const mine = await listMyEventRows(participant.id, 1);
    expect(mine.registrations).toHaveLength(1);
    expect(mine.registrations[0]?.event).toMatchObject({
      hostName: "Ada",
      place: "North Hall",
      coverKey: "covers/event/north.webp",
    });
    const mineJson = JSON.stringify(mine);
    expect(mineJson).not.toContain("participant@example.test");
    expect(mineJson).not.toContain("ada@example.test");
    expect(mineJson).not.toContain("grace@example.test");
    expect(mineJson).not.toContain("1 Secret Street");
    expect(mineJson).not.toContain("https://maps.example/secret");
    expect((await listMyEventRows(someoneElse.id, 1)).registrations).toEqual([]);

    const locationOnly = await createTestEvent(admin.id, {
      location: "Room 2",
      startsAt: new Date("2031-03-01T09:00:00.000Z"),
      endsAt: new Date("2031-03-01T10:00:00.000Z"),
    });
    const rows = await listUpcomingEventRows(1, new Date("2031-02-15T00:00:00.000Z"));
    expect(rows.events.find((item) => item.id === locationOnly.id)?.place).toBe("Room 2");
  });
});

describe("ticket presentation content", () => {
  it("shows arrival, slug, and the venue place line only to the owner or an admin", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ email: "owner@example.test" });
    const other = await createTestUser();
    const arrivedAt = new Date("2031-01-01T09:05:00.000Z");
    const event = await createTestEvent(admin.id, {
      slug: "ticket-venue",
      location: "Old campus",
      venueName: "North Hall",
      venueAddress: "1 Secret Street",
      mapUrl: "https://maps.example/secret",
    });
    await createEventHost(event.id, hostInput({ publicEmail: "ada@example.test" }));
    const registration = await db.registration.create({
      data: {
        userId: owner.id,
        eventId: event.id,
        status: "CONFIRMED",
        checkInTicketVersion: "8d0b0d5e-3c8a-4a1e-9c1a-6e0a0b5d11aa",
        checkedInAt: arrivedAt,
        checkedInById: admin.id,
      },
    });

    const ticket = await getTicketPresentation(registration.id, {
      id: owner.id,
      role: "PARTICIPANT",
    });
    expect(ticket).toMatchObject({
      participantEmail: "owner@example.test",
      checkedInAt: arrivedAt,
      event: { slug: "ticket-venue", place: "North Hall", location: "Old campus" },
    });
    const ticketJson = JSON.stringify(ticket);
    expect(ticketJson).not.toContain("ada@example.test");
    expect(ticketJson).not.toContain("1 Secret Street");
    expect(ticketJson).not.toContain("https://maps.example/secret");

    await expect(
      getTicketPresentation(registration.id, { id: admin.id, role: "ADMIN" }),
    ).resolves.toMatchObject({ participantEmail: "owner@example.test" });
    expect(
      await getTicketPresentation(registration.id, { id: other.id, role: "PARTICIPANT" }),
    ).toBeNull();

    const fallbackEvent = await createTestEvent(admin.id, { location: "Room 4" });
    const fallbackRegistration = await db.registration.create({
      data: {
        userId: owner.id,
        eventId: fallbackEvent.id,
        status: "REGISTERED",
      },
    });
    await expect(
      getTicketPresentation(fallbackRegistration.id, { id: owner.id, role: "PARTICIPANT" }),
    ).resolves.toMatchObject({
      checkedInAt: null,
      event: { place: "Room 4", slug: fallbackEvent.slug },
    });
  });
});

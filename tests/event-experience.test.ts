import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "@app/page";
import EventPage from "@app/events/[slug]/page";
import MyEventsPage from "@app/my/page";
import { formatUtcDate, formatUtcSchedule } from "@/lib/event-presentation";
import { db } from "@/lib/db";
import {
  createTestEvent,
  createTestSession,
  createTestUser,
} from "./support/database";

const experienceSources = [
  "app/page.tsx",
  "app/my/page.tsx",
  "app/events/[slug]/page.tsx",
  "src/components/event-summary.tsx",
];

async function renderHome(page?: string) {
  return renderToStaticMarkup(
    await Home({
      searchParams: Promise.resolve(page ? { page } : {}),
    }),
  );
}

async function renderEvent(slug: string) {
  return renderToStaticMarkup(
    await EventPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    }),
  );
}

async function renderMyEvents(page?: string) {
  return renderToStaticMarkup(
    await MyEventsPage({
      searchParams: Promise.resolve(page ? { page } : {}),
    }),
  );
}

function future(month: number, day: number) {
  return {
    startsAt: new Date(Date.UTC(2031, month, day, 9, 0)),
    endsAt: new Date(Date.UTC(2031, month, day, 12, 0)),
  };
}

it("lists published artwork rows without private venue or host details", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const attendee = await createTestUser({ email: "attendee.row@example.test" });
  const coveredWhen = future(5, 3);
  const plainWhen = future(5, 17);
  const fullWhen = future(6, 1);
  const covered = await createTestEvent(admin.id, {
    title: "Covered workshop",
    slug: "covered-workshop",
    ...coveredWhen,
    capacity: 5,
    location: "Old campus",
    coverKey: "covers/private/covered.webp",
    venueName: "North Hall",
    venueAddress: "9 Hidden Lane",
    mapUrl: "https://maps.example/hidden",
  });
  await db.eventHost.create({
    data: {
      eventId: covered.id,
      name: "Ada Lovelace",
      publicEmail: "ada.public@example.test",
      displayOrder: 0,
    },
  });
  await db.eventHost.create({
    data: {
      eventId: covered.id,
      name: "Grace Hopper",
      publicEmail: "grace.secret@example.test",
      displayOrder: 1,
    },
  });
  const plain = await createTestEvent(admin.id, {
    title: "Plain workshop",
    slug: "plain-workshop",
    ...plainWhen,
    location: "Room 2",
  });
  const full = await createTestEvent(admin.id, {
    title: "Full workshop",
    slug: "full-workshop",
    ...fullWhen,
    capacity: 1,
    location: "Annex",
  });
  await db.registration.create({
    data: { userId: attendee.id, eventId: full.id, status: "REGISTERED" },
  });
  await createTestEvent(admin.id, {
    title: "Cancelled workshop",
    slug: "cancelled-workshop",
    status: "CANCELLED",
    ...future(7, 1),
  });
  await createTestEvent(admin.id, {
    title: "Draft workshop",
    slug: "draft-workshop",
    status: "DRAFT",
    ...future(8, 1),
  });
  await createTestEvent(admin.id, {
    title: "Past workshop",
    slug: "past-workshop",
    startsAt: new Date("2020-01-02T09:00:00.000Z"),
    endsAt: new Date("2020-01-02T12:00:00.000Z"),
  });

  const markup = await renderHome();
  const image = markup.match(/<img\b[^>]*>/g) ?? [];

  expect(image).toHaveLength(1);
  expect(image[0]).toContain('alt="Covered workshop"');
  expect(image[0]).toContain('src="/events/covered-workshop/cover"');
  expect(markup).toContain("Hosted by Ada Lovelace");
  expect(markup).toContain(formatUtcSchedule(coveredWhen.startsAt, coveredWhen.endsAt));
  expect(markup).toContain("UTC");
  expect(markup).toContain("North Hall");
  expect(markup).toContain("Room 2");
  expect(markup).toContain("5 places left");
  expect(markup).toContain("Event full");
  expect(markup).toContain(`aria-label="${formatUtcDate(plain.startsAt)}"`);
  expect(markup).not.toContain('src="/events/plain-workshop/cover"');
  expect(markup).not.toContain("Grace Hopper");
  expect(markup).not.toContain("ada.public@example.test");
  expect(markup).not.toContain("grace.secret@example.test");
  expect(markup).not.toContain("9 Hidden Lane");
  expect(markup).not.toContain("https://maps.example/hidden");
  expect(markup).not.toContain("Old campus");
  expect(markup).not.toContain("covers/private/covered.webp");
  expect(markup).not.toContain("attendee.row@example.test");
  expect(markup).not.toContain("Cancelled workshop");
  expect(markup).not.toContain("Draft workshop");
  expect(markup).not.toContain("Past workshop");
  expect(markup).not.toContain("next/image");
  expect(markup).not.toMatch(/onerror/i);
  expect(covered.id).toBeTruthy();
});

it("paginates discovery by 20 and states when nothing is published", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const empty = await renderHome();
  expect(empty).toContain("No upcoming events yet");
  expect(empty).toContain('href="/signup"');

  for (let index = 0; index < 21; index += 1) {
    await createTestEvent(admin.id, {
      title: `Paged event ${index}`,
      slug: `paged-event-${index}`,
      startsAt: new Date(Date.UTC(2034, 0, index + 1, 9, 0)),
      endsAt: new Date(Date.UTC(2034, 0, index + 1, 12, 0)),
    });
  }

  const page1 = await renderHome();
  const page2 = await renderHome("2");
  expect(page1).toContain("Paged event 0");
  expect(page1).not.toContain("Paged event 20");
  expect(page1).toContain('href="/?page=2"');
  expect(page1).toContain("Page 1 of 2");
  expect(page2).toContain("Paged event 20");
  expect(page2).not.toContain("Paged event 0");
  expect(page2).toContain("Page 2 of 2");

  await expect(renderHome("4")).rejects.toMatchObject({
    code: "TEST_REDIRECT",
    destination: "/",
  });
});

it("shows the owner's registrations with the same row facts and status actions", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser({
    name: "Owner Example",
    email: "owner.events@example.test",
  });
  const other = await createTestUser({ email: "other.events@example.test" });
  const when = future(3, 4);
  const event = await createTestEvent(admin.id, {
    title: "Owned workshop",
    slug: "owned-workshop",
    ...when,
    capacity: 8,
    location: "Old campus",
    coverKey: "covers/private/owned.webp",
    venueName: "Studio",
    venueAddress: "4 Secret Street",
    mapUrl: "https://maps.example/owned",
  });
  await db.eventHost.create({
    data: {
      eventId: event.id,
      name: "First Host",
      publicEmail: "first.host@example.test",
      displayOrder: 0,
    },
  });
  await db.eventHost.create({
    data: {
      eventId: event.id,
      name: "Second Host",
      publicEmail: "second.host@example.test",
      displayOrder: 1,
    },
  });
  const registered = await db.registration.create({
    data: { userId: owner.id, eventId: event.id, status: "REGISTERED" },
  });
  const hidden = await createTestEvent(admin.id, {
    title: "Someone else's workshop",
    slug: "someone-elses-workshop",
    ...future(3, 5),
  });
  await db.registration.create({
    data: { userId: other.id, eventId: hidden.id, status: "CONFIRMED" },
  });
  const ticketEvent = await createTestEvent(admin.id, {
    title: "Ticketed workshop",
    slug: "ticketed-workshop",
    ...future(3, 6),
    location: "Hall",
  });
  const ticket = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: ticketEvent.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  const attendedEvent = await createTestEvent(admin.id, {
    title: "Attended workshop",
    slug: "attended-workshop",
    ...future(3, 7),
  });
  const attended = await db.registration.create({
    data: {
      userId: owner.id,
      eventId: attendedEvent.id,
      status: "ATTENDED",
      checkInTicketVersion: randomUUID(),
      certificateKey: "certificates/private/attended.pdf",
      certificateUploadedAt: new Date("2031-04-08T10:00:00.000Z"),
    },
  });
  const noShowEvent = await createTestEvent(admin.id, {
    title: "No show workshop",
    slug: "no-show-workshop",
    ...future(3, 8),
  });
  await db.registration.create({
    data: { userId: owner.id, eventId: noShowEvent.id, status: "NO_SHOW" },
  });
  const reapplyEvent = await createTestEvent(admin.id, {
    title: "Reapply workshop",
    slug: "reapply-workshop",
    ...future(3, 9),
  });
  await db.registration.create({
    data: {
      userId: owner.id,
      eventId: reapplyEvent.id,
      status: "CANCELLED",
      cancelledBy: "PARTICIPANT",
    },
  });
  const declinedEvent = await createTestEvent(admin.id, {
    title: "Declined workshop",
    slug: "declined-workshop",
    ...future(3, 10),
  });
  await db.registration.create({
    data: {
      userId: owner.id,
      eventId: declinedEvent.id,
      status: "CANCELLED",
      cancelledBy: "ADMIN",
    },
  });
  const cancelledEvent = await createTestEvent(admin.id, {
    title: "Organizer cancelled workshop",
    slug: "organizer-cancelled-workshop",
    status: "CANCELLED",
    ...future(3, 11),
    location: "Cancelled room",
  });
  await db.registration.create({
    data: {
      userId: owner.id,
      eventId: cancelledEvent.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  await createTestSession(owner.id);

  const markup = await renderMyEvents();
  const image = markup.match(/<img\b[^>]*>/) ?? [];

  expect(markup).toContain("Owned workshop");
  expect(markup).toContain("Awaiting confirmation");
  expect(markup).toContain("Hosted by First Host");
  expect(markup).toContain(formatUtcSchedule(when.startsAt, when.endsAt));
  expect(markup).toContain("Studio");
  expect(markup).toContain("Event last updated");
  expect(markup).toContain("UTC");
  expect(markup).toContain('name="registrationId"');
  expect(markup).toContain(`value="${registered.id}"`);
  expect(markup).toContain("Cancel registration");
  expect(markup).toContain("Your place is reserved");
  expect(markup).toContain(
    `href="/my/registrations/${ticket.id}/ticket"`,
  );
  expect(markup).toContain("View ticket");
  expect(markup).toContain("Confirmed");
  expect(markup).toContain(
    `href="/api/certificates/${encodeURIComponent(attended.id)}"`,
  );
  expect(markup).toContain("Download participation certificate");
  expect(markup).toContain("Attended");
  expect(markup).toContain("Did not attend");
  expect(markup).toContain("Reapply");
  expect(markup).toContain("Cancelled");
  expect(markup).toContain("only an administrator can reopen it");
  expect(markup).toContain("This event has been cancelled by its organizer.");
  expect(markup).toContain("A ticket is unavailable because the event was cancelled.");
  expect(image.some((tag) => tag.includes('src="/events/owned-workshop/cover"'))).toBe(true);
  expect(image.some((tag) => tag.includes('alt="Owned workshop"'))).toBe(true);
  expect(markup).not.toContain("Second Host");
  expect(markup).not.toContain("first.host@example.test");
  expect(markup).not.toContain("4 Secret Street");
  expect(markup).not.toContain("https://maps.example/owned");
  expect(markup).not.toContain("Old campus");
  expect(markup).not.toContain("Someone else's workshop");
  expect(markup).not.toContain("other.events@example.test");
  expect(markup).not.toContain("covers/private/owned.webp");
  expect(markup).not.toContain("certificates/private/attended.pdf");
});

it("keeps my events to the owner and pages 20 registrations", async () => {
  await expect(renderMyEvents()).rejects.toMatchObject({
    code: "TEST_REDIRECT",
    destination: "/login",
  });

  const admin = await createTestUser({ role: "ADMIN" });
  const owner = await createTestUser();
  await createTestSession(owner.id);
  const empty = await renderMyEvents();
  expect(empty).toContain("No event applications yet");
  expect(empty).toContain("Explore upcoming events");

  for (let index = 0; index < 21; index += 1) {
    const event = await createTestEvent(admin.id, {
      title: `Mine ${index}`,
      slug: `mine-${index}`,
      ...future(1, index + 1),
    });
    await db.registration.create({
      data: {
        userId: owner.id,
        eventId: event.id,
        status: "REGISTERED",
        createdAt: new Date(Date.UTC(2035, 0, 1, 0, index)),
      },
    });
  }

  const page1 = await renderMyEvents();
  const page2 = await renderMyEvents("2");
  expect(page1).toContain("Mine 20");
  expect(page1).not.toContain("Mine 0");
  expect(page1).toContain("Page 1 of 2");
  expect(page2).toContain("Mine 0");
  expect(page2).not.toContain("Mine 20");
  expect(page2).toContain('href="/my?page=1"');
});

it("leads the event page with artwork, people, place, and one repeated action", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const when = future(5, 11);
  const title = "A long workshop title that must wrap on a narrow screen without clipping";
  const event = await createTestEvent(admin.id, {
    title,
    slug: "long-workshop",
    ...when,
    location: "Old campus",
    coverKey: "covers/private/long.webp",
    venueName: "Main Hall",
    venueAddress: "1 Public Road",
    mapUrl: "https://maps.example/place",
  });
  const ada = await db.eventHost.create({
    data: {
      eventId: event.id,
      name: "Ada Lovelace",
      biography: "Wrote the notes.",
      publicEmail: "Ada@Example.test",
      avatarKey: "avatars/private/ada.webp",
      displayOrder: 0,
    },
  });
  await db.eventHost.create({
    data: {
      eventId: event.id,
      name: "Grace Hopper",
      publicEmail: "not-an-email",
      displayOrder: 1,
    },
  });
  const bare = await createTestEvent(admin.id, {
    title: "Library hour",
    slug: "library-hour",
    ...future(5, 12),
    location: "Reading room",
    mapUrl: "http://maps.example/insecure",
  });

  const markup = await renderEvent(event.slug);
  const schedule = formatUtcSchedule(when.startsAt, when.endsAt);
  const imageAt = markup.indexOf('src="/events/long-workshop/cover"');
  const headingAt = markup.indexOf("<h1");
  const scheduleAt = markup.indexOf(schedule, headingAt);
  const scheduleSlot = markup.indexOf('data-registration-slot="schedule"', scheduleAt);
  const hostAt = markup.indexOf("Ada Lovelace", scheduleSlot);
  const graceAt = markup.indexOf("Grace Hopper", hostAt);
  const venueAt = markup.indexOf("Main Hall", graceAt);
  const addressAt = markup.indexOf("1 Public Road", venueAt);
  const mapAt = markup.indexOf(">Map<", addressAt);
  const aboutAt = markup.indexOf("An event for an integration test.", mapAt);
  const closingAt = markup.indexOf('data-registration-slot="closing"', aboutAt);
  const columnAt = markup.indexOf('data-registration-slot="column"', aboutAt);
  const loginHref = `/login?next=${encodeURIComponent("/events/long-workshop")}`;
  const images = markup.match(/<img\b[^>]*>/g) ?? [];
  const mapLink = markup.match(/<a\b[^>]*href="https:\/\/maps\.example\/place"[^>]*>/)?.[0] ?? "";

  expect(imageAt).toBeGreaterThan(-1);
  expect(headingAt).toBeGreaterThan(imageAt);
  expect(scheduleAt).toBeGreaterThan(headingAt);
  expect(scheduleSlot).toBeGreaterThan(scheduleAt);
  expect(hostAt).toBeGreaterThan(scheduleSlot);
  expect(graceAt).toBeGreaterThan(hostAt);
  expect(venueAt).toBeGreaterThan(graceAt);
  expect(addressAt).toBeGreaterThan(venueAt);
  expect(mapAt).toBeGreaterThan(addressAt);
  expect(aboutAt).toBeGreaterThan(mapAt);
  expect(closingAt).toBeGreaterThan(aboutAt);
  expect(columnAt).toBeGreaterThan(aboutAt);
  expect(markup.match(/<h1\b/g)).toHaveLength(1);
  expect(markup).toContain(title);
  expect(markup).toContain(`alt="${title}"`);
  expect(images).toHaveLength(2);
  expect(images[1]).toContain('alt=""');
  expect(images[1]).toContain(`/events/long-workshop/hosts/${ada.id}/avatar`);
  expect(markup).toContain("Wrote the notes.");
  expect(markup).toContain('href="mailto:ada@example.test"');
  expect(markup).toContain("ada@example.test");
  expect(markup).not.toContain("not-an-email");
  expect(markup).not.toContain("Old campus");
  expect(markup).not.toContain("covers/private/long.webp");
  expect(markup).not.toContain("avatars/private/ada.webp");
  expect(markup.slice(mapAt, mapAt + 400)).toContain('aria-hidden="true"');
  expect(mapLink).toContain('target="_blank"');
  expect(mapLink).toContain('rel="noopener noreferrer"');
  expect(markup.split(loginHref).length - 1).toBe(3);
  expect(markup.match(/data-registration-kind="sign-in"/g)).toHaveLength(3);
  expect(markup.match(/Sign in to apply/g)).toHaveLength(3);
  expect(markup.match(/Your place/g)).toHaveLength(2);

  const bareMarkup = await renderEvent(bare.slug);
  expect(bareMarkup).toContain("Reading room");
  expect(bareMarkup).toContain(`aria-label="${formatUtcDate(bare.startsAt)}"`);
  expect(bareMarkup).not.toContain("Hosts");
  expect(bareMarkup).not.toContain("<img");
  expect(bareMarkup).not.toContain("http://maps.example/insecure");
  expect(bareMarkup).not.toContain(">Map</a>");

  const css = readFileSync("app/events/[slug]/page.module.css", "utf8");
  const mediaAt = css.indexOf("@media (min-width: 1024px)");
  const before = css.slice(0, mediaAt);
  const after = css.slice(mediaAt);
  expect(mediaAt).toBeGreaterThan(-1);
  expect(before).toMatch(/\.columnAction\s*\{[^}]*display:\s*none/);
  expect(after).toContain("minmax(0, 1fr) 320px");
  expect(after).toContain("align-items: start");
  expect(after).toContain("align-self: start");
  expect(after).toContain("width: 320px");
  expect(after).toMatch(/\.scheduleAction,\s*\.closingAction\s*\{[^}]*display:\s*none/);
  expect(after).toMatch(/\.columnAction\s*\{[^}]*display:\s*grid/);
  expect(css).not.toMatch(/position:\s*fixed/);
  expect(css).not.toMatch(/position:\s*sticky/);
  expect(readFileSync("app/page.module.css", "utf8")).toContain("overflow-wrap: anywhere");
  expect(css).toContain("overflow-wrap: anywhere");

  for (const file of experienceSources) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("next/image");
    expect(source).not.toContain("use client");
    expect(source).not.toMatch(/onError|onerror/);
  }
});

it("keeps apply, ticket, full, closed, and cancelled event actions", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser({ email: "participant.detail@example.test" });
  const open = await createTestEvent(admin.id, {
    title: "Open workshop",
    slug: "open-workshop",
    ...future(2, 2),
    capacity: 4,
    location: "Room 1",
  });
  await createTestSession(participant.id);
  const applyMarkup = await renderEvent(open.slug);
  expect(applyMarkup.match(/Apply to attend/g)).toHaveLength(3);
  expect(applyMarkup.match(/data-registration-kind="apply"/g)).toHaveLength(3);
  expect(applyMarkup).toContain('name="eventSlug"');
  expect(applyMarkup).toContain('value="open-workshop"');
  expect(applyMarkup).not.toContain("Sign in to apply");

  const awaitingEvent = await createTestEvent(admin.id, {
    title: "Awaiting workshop",
    slug: "awaiting-workshop",
    ...future(2, 3),
  });
  await db.registration.create({
    data: { userId: participant.id, eventId: awaitingEvent.id, status: "REGISTERED", checkInTicketVersion: randomUUID() },
  });
  const awaiting = await renderEvent(awaitingEvent.slug);
  expect(awaiting).toContain("Show your QR to an administrator onsite");
  expect(awaiting).toContain("/ticket");
  expect(awaiting).not.toContain("Apply to attend");

  const ticketEvent = await createTestEvent(admin.id, {
    title: "Confirmed workshop",
    slug: "confirmed-workshop",
    ...future(2, 4),
  });
  const ticket = await db.registration.create({
    data: {
      userId: participant.id,
      eventId: ticketEvent.id,
      status: "CONFIRMED",
      checkInTicketVersion: randomUUID(),
    },
  });
  const ticketMarkup = await renderEvent(ticketEvent.slug);
  const ticketHref = `/my/registrations/${ticket.id}/ticket`;
  expect(ticketMarkup.split(ticketHref).length - 1).toBe(3);
  expect(ticketMarkup.match(/View ticket/g)).toHaveLength(3);
  expect(ticketMarkup).toContain("Your place is confirmed.");
  expect(ticketMarkup.match(/data-registration-kind="ticket"/g)).toHaveLength(3);

  const fullEvent = await createTestEvent(admin.id, {
    title: "Filled workshop",
    slug: "filled-workshop",
    ...future(2, 5),
    capacity: 1,
  });
  await db.registration.create({
    data: { userId: admin.id, eventId: fullEvent.id, status: "REGISTERED" },
  });
  const full = await renderEvent(fullEvent.slug);
  expect(full).toContain("Event full");
  expect(full).toContain("All places are currently reserved.");
  expect(full).not.toContain("Apply to attend");
  expect(full).not.toContain("Sign in to apply");

  const closed = await createTestEvent(admin.id, {
    title: "Closed workshop",
    slug: "closed-workshop",
    startsAt: new Date("2020-05-01T09:00:00.000Z"),
    endsAt: new Date("2020-05-01T12:00:00.000Z"),
    location: "Archive",
  });
  const closedMarkup = await renderEvent(closed.slug);
  expect(closedMarkup).toContain("Registration closed");
  expect(closedMarkup).toContain("Registration closed when the event started.");
  expect(closedMarkup).not.toContain("Apply to attend");

  const cancelled = await createTestEvent(admin.id, {
    title: "Direct cancelled workshop",
    slug: "direct-cancelled-workshop",
    status: "CANCELLED",
    ...future(2, 6),
    location: "Still listed",
  });
  const cancelledMarkup = await renderEvent(cancelled.slug);
  expect(cancelledMarkup).toContain("This event has been cancelled.");
  expect(cancelledMarkup).toContain("Event cancelled");
  expect(cancelledMarkup).toContain("Still listed");
  expect(cancelledMarkup).toContain("Registration is closed.");
  expect(cancelledMarkup).not.toContain("Apply to attend");

  const reapplyEvent = await createTestEvent(admin.id, {
    title: "Reapply detail",
    slug: "reapply-detail",
    ...future(2, 7),
    capacity: 3,
  });
  await db.registration.create({
    data: {
      userId: participant.id,
      eventId: reapplyEvent.id,
      status: "CANCELLED",
      cancelledBy: "PARTICIPANT",
    },
  });
  const reapply = await renderEvent(reapplyEvent.slug);
  expect(reapply.match(/Apply again/g)).toHaveLength(3);
  expect(reapply).toContain("You cancelled your earlier application.");

  const declinedEvent = await createTestEvent(admin.id, {
    title: "Declined detail",
    slug: "declined-detail",
    ...future(2, 8),
  });
  await db.registration.create({
    data: {
      userId: participant.id,
      eventId: declinedEvent.id,
      status: "CANCELLED",
      cancelledBy: "ADMIN",
    },
  });
  const declined = await renderEvent(declinedEvent.slug);
  expect(declined).toContain("An administrator closed your application.");
  expect(declined).not.toContain("Apply again");
  expect(declined).not.toContain("Apply to attend");

  await expect(renderEvent("missing-workshop")).rejects.toMatchObject({
    code: "TEST_NOT_FOUND",
  });
  const draft = await createTestEvent(admin.id, {
    title: "Hidden draft",
    slug: "hidden-draft",
    status: "DRAFT",
    ...future(2, 9),
  });
  await expect(renderEvent(draft.slug)).rejects.toMatchObject({
    code: "TEST_NOT_FOUND",
  });
});

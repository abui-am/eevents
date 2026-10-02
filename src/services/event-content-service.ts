import "server-only";

import type { EventStatus, RegistrationStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const EVENT_CONTENT_PAGE_SIZE = 20;

const listHostSelect = {
  orderBy: { displayOrder: "asc" as const },
  take: 1,
  select: { name: true },
};

export type UpcomingEventRow = {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  location: string | null;
  venueName: string | null;
  place: string | null;
  coverKey: string | null;
  hostName: string | null;
  activeRegistrationCount: number;
};

export type MyEventRow = {
  id: string;
  status: RegistrationStatus;
  event: {
    id: string;
    title: string;
    slug: string;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
    updatedAt: Date;
    location: string | null;
    venueName: string | null;
    place: string | null;
    coverKey: string | null;
    hostName: string | null;
  };
};

export type VisibleEventHost = {
  id: string;
  name: string;
  biography: string | null;
  publicEmail: string | null;
  avatarKey: string | null;
  displayOrder: number;
};

export type VisibleEventContent = {
  id: string;
  title: string;
  slug: string;
  description: string;
  location: string | null;
  coverKey: string | null;
  venueName: string | null;
  venueAddress: string | null;
  mapUrl: string | null;
  place: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
  activeRegistrationCount: number;
  hosts: VisibleEventHost[];
  hasRegistrationQuestions: boolean;
};

function pageWindow(pageNumber: number, total: number) {
  const pageCount = Math.max(1, Math.ceil(total / EVENT_CONTENT_PAGE_SIZE));
  const requested = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  return { page: Math.min(requested, pageCount), pageCount, total };
}

function placeLine(venueName: string | null, location: string | null): string | null {
  return venueName ?? location;
}

export async function listUpcomingEventRows(
  pageNumber: number,
  now = new Date(),
): Promise<{
  events: UpcomingEventRow[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const where = { status: "PUBLISHED" as const, startsAt: { gt: now } };
  const total = await db.event.count({ where });
  const window = pageWindow(pageNumber, total);
  const events = await db.event.findMany({
    where,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    skip: (window.page - 1) * EVENT_CONTENT_PAGE_SIZE,
    take: EVENT_CONTENT_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      location: true,
      venueName: true,
      coverKey: true,
      _count: {
        select: {
          registrations: { where: { status: { not: "CANCELLED" } } },
        },
      },
      hosts: listHostSelect,
    },
  });

  return {
    ...window,
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      slug: event.slug,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      capacity: event.capacity,
      location: event.location,
      venueName: event.venueName,
      place: placeLine(event.venueName, event.location),
      coverKey: event.coverKey,
      hostName: event.hosts[0]?.name ?? null,
      activeRegistrationCount: event._count.registrations,
    })),
  };
}

export async function listMyEventRows(
  userId: string,
  pageNumber: number,
): Promise<{
  registrations: MyEventRow[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const where = { userId };
  const total = await db.registration.count({ where });
  const window = pageWindow(pageNumber, total);
  const registrations = await db.registration.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (window.page - 1) * EVENT_CONTENT_PAGE_SIZE,
    take: EVENT_CONTENT_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          startsAt: true,
          endsAt: true,
          updatedAt: true,
          location: true,
          venueName: true,
          coverKey: true,
          hosts: listHostSelect,
        },
      },
    },
  });

  return {
    ...window,
    registrations: registrations.map((registration) => ({
      id: registration.id,
      status: registration.status,
      event: {
        id: registration.event.id,
        title: registration.event.title,
        slug: registration.event.slug,
        status: registration.event.status,
        startsAt: registration.event.startsAt,
        endsAt: registration.event.endsAt,
        updatedAt: registration.event.updatedAt,
        location: registration.event.location,
        venueName: registration.event.venueName,
        place: placeLine(registration.event.venueName, registration.event.location),
        coverKey: registration.event.coverKey,
        hostName: registration.event.hosts[0]?.name ?? null,
      },
    })),
  };
}

/** Published and cancelled events only. Drafts are indistinguishable from a missing slug. */
export async function getVisibleEventContent(
  slug: string,
): Promise<VisibleEventContent | null> {
  const event = await db.event.findFirst({
    where: { slug, status: { not: "DRAFT" } },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      location: true,
      coverKey: true,
      venueName: true,
      venueAddress: true,
      mapUrl: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      currentQuestionnaireVersion: { select: { questions: true } },
      _count: {
        select: {
          registrations: { where: { status: { not: "CANCELLED" } } },
        },
      },
      hosts: {
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          biography: true,
          publicEmail: true,
          avatarKey: true,
          displayOrder: true,
        },
      },
    },
  });
  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    location: event.location,
    coverKey: event.coverKey,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    mapUrl: event.mapUrl,
    place: placeLine(event.venueName, event.location),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    activeRegistrationCount: event._count.registrations,
    hasRegistrationQuestions: Array.isArray(event.currentQuestionnaireVersion?.questions) && event.currentQuestionnaireVersion.questions.length > 0,
    hosts: event.hosts,
  };
}

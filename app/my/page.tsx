import { StatusBadge } from "@/components/ui/badge";
import { LocalizedTimestamp } from "@/components/localized-time";
import type { Metadata } from "next";
import Link from "next/link";
import type { EventStatus, RegistrationStatus } from "@prisma/client";
import { cancelOwnRegistrationAction, applyForEventAction } from "@app/actions/registration";
import { SiteHeader } from "@/components/site-header";
import { EventArtwork, EventFacts, placeLine } from "@/components/event-summary";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAvailability } from "@/lib/event-presentation";
import { EVENT_CONTENT_PAGE_SIZE } from "@/services/event-content-service";
import styles from "./my-events.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "My events" };

const PAGE_SIZE = EVENT_CONTENT_PAGE_SIZE;

const registrationMessages: Record<string, string> = {
  applied: "Your application is in. Your place is reserved and your QR is ready for onsite confirmation.",
  reapplied: "You rejoined the event. Your place is reserved and your new QR is ready.",
  already: "You already have an active registration for that event.",
  declined: "The organizer declined this application. Contact the organizer if you have questions.",
  full: "There are no places available right now.",
  closed: "Registration closed when the event started.",
  cancelled: "Your registration was cancelled and the place is available to someone else.",
  late: "Registration can only be cancelled before the event starts.",
  "not-cancellable": "This registration cannot be cancelled from your account.",
  unavailable: "We could not update this registration. Try again shortly.",
};

const statusLabels: Record<RegistrationStatus, string> = {
  REGISTERED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  ATTENDED: "Attended",
  NO_SHOW: "Did not attend",
  CANCELLED: "Cancelled",
};

function getPageNumber(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number(value);
}

function availabilityLabel(
  event: {
    status: EventStatus;
    capacity: number;
    startsAt: Date;
    activeRegistrationCount: number;
  },
  now: Date,
): string {
  if (event.status === "CANCELLED") return "Event cancelled";
  if (event.status !== "PUBLISHED") return "Registration closed";
  return getAvailability(
    event.capacity,
    event.activeRegistrationCount,
    event.startsAt,
    now,
  ).label;
}

type MyEventsPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    registration?: string | string[];
  }>;
};

function MyEventsError() {
  return (
    <section className={styles.emptyState} aria-labelledby="my-events-error-title">
      <h2 id="my-events-error-title">My events could not be loaded</h2>
      <p>Refresh the page. If this keeps happening, try again in a little while.</p>
      <Link className={styles.primaryLink} href="/my">
        Try again
      </Link>
    </section>
  );
}

export default async function MyEventsPage({ searchParams }: MyEventsPageProps) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const resultCode = Array.isArray(params.registration)
    ? params.registration[0]
    : params.registration;
  const resultMessage =
    resultCode && Object.hasOwn(registrationMessages, resultCode)
      ? registrationMessages[resultCode]
      : undefined;
  const now = new Date();

  let loaded: Awaited<ReturnType<typeof loadMyEvents>> | null = null;
  try {
    loaded = await loadMyEvents(user.id, getPageNumber(params.page));
  } catch {
    console.error("Could not load my events.");
  }

  return (
    <>
      <SiteHeader user={user} current="my" />
      <main id="main-content" tabIndex={-1} className={styles.page} data-attendee-glass>
        <div className={styles.content}>
          <header className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>Your account</p>
              <h1>My events</h1>
              <p className={styles.intro}>
                Your applications, onsite tickets, and participation certificates.
              </p>
            </div>
            <Link className={styles.browseLink} href="/">
              Browse events
            </Link>
          </header>

          {resultMessage ? (
            <p className={styles.notice} role="status" aria-live="polite">
              {resultMessage}
            </p>
          ) : null}

          {!loaded ? (
            <MyEventsError />
          ) : loaded.registrations.length === 0 ? (
            <section className={styles.emptyState} aria-labelledby="empty-title">
              <span className={styles.emptyMark} aria-hidden="true">＋</span>
              <h2 id="empty-title">No event applications yet</h2>
              <p>Find a workshop or training and reserve your place.</p>
              <Link className={styles.primaryLink} href="/">
                Explore upcoming events
              </Link>
            </section>
          ) : (
            <MyEventList
              now={now}
              page={loaded.page}
              pageCount={loaded.pageCount}
              registrations={loaded.registrations}
            />
          )}
        </div>
      </main>
    </>
  );
}

type MyEventRecord = Awaited<ReturnType<typeof loadMyEvents>>["registrations"][number];

function MyEventList({
  now,
  page,
  pageCount,
  registrations,
}: {
  now: Date;
  page: number;
  pageCount: number;
  registrations: MyEventRecord[];
}) {
  return (
    <>
      <ol className={styles.eventList}>
        {registrations.map((registration) => {
          const { event } = registration;
          const eventCancelled = event.status === "CANCELLED";
          const isActive =
            registration.status === "REGISTERED" ||
            registration.status === "CONFIRMED";
          const beforeStart = event.startsAt > now;
          const hasTicketStatus =
            registration.status === "REGISTERED" || registration.status === "CONFIRMED" ||
            registration.status === "ATTENDED";
          const ticketCanBeUsed =
            hasTicketStatus &&
            registration.checkInTicketVersion !== null &&
            event.status === "PUBLISHED";
          const canReapply =
            registration.status === "CANCELLED" &&
            registration.cancelledBy === "PARTICIPANT" &&
            beforeStart &&
            event.status === "PUBLISHED";

          return (
            <li key={registration.id}>
              <article className={styles.eventCard}>
                <div className={styles.summary}>
                  <EventArtwork
                    size="row"
                    slug={event.slug}
                    title={event.title}
                    coverKey={event.coverKey}
                    startsAt={event.startsAt}
                  />
                  <div className={styles.summaryCopy}>
                    <h2 className={styles.eventTitle}>
                      <Link href={`/events/${event.slug}`}>{event.title}</Link>
                    </h2>
                    <p className={styles.statusLine}><StatusBadge status={registration.status}>
                      {statusLabels[registration.status]}
                    </StatusBadge></p>
                    <EventFacts
                      hostName={event.hosts[0]?.name ?? null}
                      startsAt={event.startsAt}
                      endsAt={event.endsAt}
                      place={placeLine(event.venueName, event.location)}
                    />
                    <p className={styles.availability}>
                      {availabilityLabel(event, now)}
                    </p>
                  </div>
                </div>

                {eventCancelled ? (
                  <p className={styles.eventWarning} role="status">
                    This event has been cancelled by its organizer.
                  </p>
                ) : null}
                <p className={styles.updatedAt}>
                  Event last updated <LocalizedTimestamp value={event.updatedAt.toISOString()} />.
                </p>

                {registration.status === "REGISTERED" && !eventCancelled ? (
                  <p className={styles.explanation}>
                    Your place is reserved. The organizer still needs to confirm
                    your application. Your QR is ready; an onsite scan confirms your attendance.
                  </p>
                ) : null}

                {hasTicketStatus && !ticketCanBeUsed ? (
                  <p className={styles.explanation}>
                    {eventCancelled
                      ? "A ticket is unavailable because the event was cancelled."
                      : "A ticket is unavailable while this event is not published."}
                  </p>
                ) : null}

                {ticketCanBeUsed ? (
                  <p className={styles.ticketLink}>
                    <Link href={`/my/registrations/${encodeURIComponent(registration.id)}/ticket`}>
                      View ticket
                    </Link>
                  </p>
                ) : null}

                <p className={styles.ticketLink}><Link href={`/my/registrations/${registration.id}/answers`}>View application answers</Link></p>

                {registration.status === "CANCELLED" &&
                registration.cancelledBy === "ADMIN" ? (
                  <p className={styles.explanation}>
                    The organizer declined this application. Contact them if you
                    have questions; only an administrator can reopen it.
                  </p>
                ) : null}

                {isActive && beforeStart ? (
                  <div className={styles.actions}>
                    <p className={styles.actionHint}>
                      Cancelling releases your reserved place.
                    </p>
                    <form action={cancelOwnRegistrationAction}>
                      <input
                        type="hidden"
                        name="registrationId"
                        value={registration.id}
                      />
                      <button className={styles.quietButton} type="submit">
                        Cancel registration
                      </button>
                    </form>
                  </div>
                ) : null}

                {isActive && !beforeStart ? (
                  <p className={styles.explanation}>
                    Registration changes closed when the event started.
                  </p>
                ) : null}

                {canReapply ? (
                  <div className={styles.actions}>
                    <p className={styles.actionHint}>
                      You cancelled this application. Reapply before the event
                      starts if a place is available.
                    </p>
                    <form action={applyForEventAction}>
                      <input type="hidden" name="eventSlug" value={event.slug} />
                      <button className={styles.primaryButton} type="submit">
                        Reapply
                      </button>
                    </form>
                  </div>
                ) : null}

                {registration.status === "CANCELLED" &&
                registration.cancelledBy === "PARTICIPANT" &&
                !canReapply &&
                beforeStart ? (
                  <p className={styles.explanation}>
                    Reapplying is unavailable because this event is not open for
                    registration.
                  </p>
                ) : null}

                {registration.status === "ATTENDED" ? (
                  <div className={styles.certificate}>
                    {registration.certificate ? (
                      <Link href={`/certificates/${registration.certificate.token}`}>View participation certificate</Link>
                    ) : registration.certificateKey && registration.certificateUploadedAt ? (
                      <Link href={`/api/certificates/${encodeURIComponent(registration.id)}`}>
                        Download participation certificate
                      </Link>
                    ) : (
                      <p className={styles.explanation}>
                        Show your QR to an administrator after the event ends to verify onsite presence and receive your certificate. There is no deadline for the final scan.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="My events pages">
          {page > 1 ? (
            <Link href={`/my?page=${page - 1}`}>Previous</Link>
          ) : <span aria-disabled="true">Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link href={`/my?page=${page + 1}`}>Next</Link>
          ) : <span aria-disabled="true">Next</span>}
        </nav>
      ) : null}
    </>
  );
}

async function loadMyEvents(userId: string, requestedPage: number) {
  const where = { userId };
  const total = await db.registration.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const registrations = await db.registration.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      status: true,
      cancelledBy: true,
      checkInTicketVersion: true,
      certificateKey: true,
      certificateUploadedAt: true,
      certificate: { select: { token: true } },
      createdAt: true,
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          location: true,
          venueName: true,
          coverKey: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          status: true,
          updatedAt: true,
          hosts: {
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { name: true },
          },
          _count: {
            select: {
              registrations: { where: { status: { not: "CANCELLED" } } },
            },
          },
        },
      },
    },
  });

  return {
    page,
    pageCount,
    total,
    registrations: registrations.map((registration) => ({
      ...registration,
      event: {
        ...registration.event,
        activeRegistrationCount: registration.event._count.registrations,
      },
    })),
  };
}

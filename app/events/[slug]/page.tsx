import { LocalizedSchedule, LocalizedTimestamp } from "@/components/localized-time";
import type { ReactNode } from "react";
import type { CancellationActor, RegistrationStatus } from "@prisma/client";
import { ArrowTopRightOnSquareIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applyForEventAction } from "@app/actions/registration";
import { SiteHeader } from "@/components/site-header";
import { EventArtwork, hostAvatarSrc } from "@/components/event-summary";
import {
  getAvailability,
} from "@/lib/event-presentation";
import { getUser, type AuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mapUrlValueSchema, publicEmailValueSchema } from "@/lib/validation";
import { getVisibleEventContent, type VisibleEventContent } from "@/services/event-content-service";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type EventPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ registration?: string | string[] }>;
};

type ViewerRegistration = {
  id: string;
  status: RegistrationStatus;
  cancelledBy: CancellationActor | null;
  checkInTicketVersion: string | null;
};

type RegistrationResult = {
  message: string;
  tone: "success" | "warning" | "neutral";
};

type ActionKind = "apply" | "sign-in" | "ticket" | "explanation";
type ActionSlot = "schedule" | "closing" | "column";

const registrationResults: Record<string, RegistrationResult> = {
  applied: {
    message:
      "Application received. Your place is reserved. Your QR is ready for onsite confirmation.",
    tone: "success",
  },
  reapplied: {
    message:
      "You applied again. Your place is reserved. Your new QR is ready for onsite confirmation.",
    tone: "success",
  },
  already: {
    message: "You already have an active application for this event.",
    tone: "neutral",
  },
  declined: {
    message:
      "An administrator closed your earlier application. Contact the event organizer if you need help.",
    tone: "warning",
  },
  full: {
    message: "This event is full. Check back later in case a place becomes available.",
    tone: "warning",
  },
  closed: {
    message: "Registration for this event is closed.",
    tone: "warning",
  },
  unavailable: {
    message:
      "We could not apply you to this event. Review the event details and try again.",
    tone: "warning",
  },
};

function textOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function httpsMapUrl(value: string | null): string | null {
  const parsed = mapUrlValueSchema.safeParse(value);
  if (!parsed.success || parsed.data === null) return null;
  return parsed.data;
}

function mailtoHref(value: string | null): string | null {
  const parsed = publicEmailValueSchema.safeParse(value);
  if (!parsed.success || parsed.data === null) return null;
  return `mailto:${parsed.data}`;
}

function EventLoadError({ user }: { user: AuthenticatedUser | null }) {
  return (
    <>
      <SiteHeader user={user} current="events" />
      <main id="main-content" tabIndex={-1} className={styles.page} data-attendee-glass>
        <section className="empty-state" aria-labelledby="event-error-title">
          <h1 id="event-error-title">This event could not be loaded</h1>
          <p>
            Refresh the page. If the event still does not appear, return to the
            list.
          </p>
          <Link className="button" href="/">
            Browse events
          </Link>
        </section>
      </main>
    </>
  );
}

function Hosts({ event }: { event: VisibleEventContent }) {
  if (event.hosts.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="event-hosts">
      <h2 id="event-hosts">Hosts</h2>
      <ol className={styles.hostList}>
        {event.hosts.map((host) => {
          const biography = textOrNull(host.biography);
          const email = mailtoHref(host.publicEmail);
          const avatar = textOrNull(host.avatarKey);
          return (
            <li className={styles.host} key={host.id}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.avatar}
                  src={hostAvatarSrc(event.slug, host.id)}
                  alt=""
                  width={64}
                  height={64}
                />
              ) : null}
              <div className={styles.hostCopy}>
                <h3>{host.name}</h3>
                {biography ? <p>{biography}</p> : null}
                {email ? (
                  <a className={styles.mailLink} href={email}>
                    <EnvelopeIcon aria-hidden="true" width={20} height={20} />
                    {email.slice("mailto:".length)}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Venue({ event }: { event: VisibleEventContent }) {
  const venueName = textOrNull(event.venueName);
  const venueAddress = textOrNull(event.venueAddress);
  const mapUrl = httpsMapUrl(event.mapUrl);
  const location = textOrNull(event.location);
  if (!venueName && !venueAddress && !mapUrl && !location) return null;

  return (
    <section className={styles.section} aria-labelledby="event-place">
      <h2 id="event-place">Place</h2>
      <div className={styles.placeLines}>
        {venueName || venueAddress || mapUrl ? (
          <>
            {venueName ? <p>{venueName}</p> : null}
            {venueAddress ? <p>{venueAddress}</p> : null}
            {mapUrl ? (
              <p>
                <a
                  className={styles.mapLink}
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Map
                  <ArrowTopRightOnSquareIcon aria-hidden="true" width={20} height={20} />
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <p>{location}</p>
        )}
      </div>
    </section>
  );
}

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const [{ slug }, query, user] = await Promise.all([
    params,
    searchParams,
    getUser(),
  ]);

  let event: VisibleEventContent | null = null;
  let registration: ViewerRegistration | null = null;
  try {
    event = await getVisibleEventContent(slug);
    if (event && user) {
      registration = await db.registration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        select: {
          id: true,
          status: true,
          cancelledBy: true,
          checkInTicketVersion: true,
        },
      });
    }
  } catch {
    console.error("Could not load event.");
    return <EventLoadError user={user} />;
  }

  if (!event) notFound();
  const visibleEvent = event;

  const now = new Date();
  const availability = getAvailability(
    visibleEvent.capacity,
    visibleEvent.activeRegistrationCount,
    visibleEvent.startsAt,
    now,
  );
  const registrationParam = Array.isArray(query.registration)
    ? query.registration[0]
    : query.registration;
  const result =
    registrationParam &&
    Object.prototype.hasOwnProperty.call(registrationResults, registrationParam)
      ? registrationResults[registrationParam]
      : undefined;
  const isCancelled = visibleEvent.status === "CANCELLED";
  const isOpen =
    !isCancelled &&
    visibleEvent.startsAt > now &&
    visibleEvent.activeRegistrationCount < visibleEvent.capacity;
  const canReapply =
    registration?.status === "CANCELLED" &&
    registration.cancelledBy === "PARTICIPANT";
  const canApply = isOpen && (!registration || canReapply) && user !== null;
  const hasTicketStatus =
    registration?.status === "REGISTERED" || registration?.status === "CONFIRMED" || registration?.status === "ATTENDED";
  const ticketHref =
    registration &&
    hasTicketStatus &&
    registration.checkInTicketVersion &&
    visibleEvent.status === "PUBLISHED"
      ? `/my/registrations/${encodeURIComponent(registration.id)}/ticket`
      : null;
  const returnPath = `/events/${encodeURIComponent(visibleEvent.slug)}`;
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const applyLabel = canReapply ? "Apply again" : "Apply to attend";
  const showUpdated =
    visibleEvent.updatedAt.getTime() - visibleEvent.createdAt.getTime() > 5_000;
  const paragraphs = visibleEvent.description
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0);

  const stateMessages = (): ReactNode[] => {
    const messages: ReactNode[] = [];
    if (isCancelled && registration) {
      messages.push(
        <p key="cancelled-record" className="registration-state registration-state-warning">
          This event was cancelled. Your registration record remains in My Events.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "REGISTERED" && !result) {
      messages.push(
        <p key="awaiting" className="registration-state registration-state-success">
          Application received. Your place is reserved. Show your QR to an administrator onsite to confirm attendance.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "CONFIRMED") {
      messages.push(
        <p key="confirmed" className="registration-state registration-state-success">
          Your place is confirmed.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "ATTENDED") {
      messages.push(
        <p key="attended" className="registration-state registration-state-success">
          Your attendance has been recorded.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "NO_SHOW") {
      messages.push(
        <p key="no-show" className="registration-state registration-state-neutral">
          This registration is closed. Your status is marked as no-show.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "CANCELLED" && canReapply) {
      messages.push(
        <p key="self-cancelled" className="registration-state registration-state-neutral">
          You cancelled your earlier application.
        </p>,
      );
    }
    if (!isCancelled && registration?.status === "CANCELLED" && !canReapply) {
      messages.push(
        <p key="declined" className="registration-state registration-state-warning">
          An administrator closed your application. Contact the event organizer
          if you need help.
        </p>,
      );
    }
    if (!registration && visibleEvent.startsAt <= now && !isCancelled) {
      messages.push(
        <p key="started" className="registration-help">
          Registration closed when the event started.
        </p>,
      );
    }
    if (!registration && availability.isFull && !isCancelled) {
      messages.push(
        <p key="full" className="registration-help">
          All places are currently reserved.
        </p>,
      );
    }
    if (
      registration?.status === "CANCELLED" &&
      canReapply &&
      !isOpen &&
      !isCancelled
    ) {
      messages.push(
        <p key="reapply-closed" className="registration-help">
          {availability.isFull
            ? "All places are currently reserved."
            : "Registration closed when the event started."}
        </p>,
      );
    }
    if (hasTicketStatus && !ticketHref && !isCancelled) {
      messages.push(
        <p key="ticket-unavailable" className="registration-help">
          {visibleEvent.status !== "PUBLISHED"
              ? "A ticket is unavailable while this event is not published."
              : "A ticket is not available for this registration yet."}
        </p>,
      );
    }
    return messages;
  };

  const actionKind = (): ActionKind => {
    if (canApply) return "apply";
    if (!user && isOpen) return "sign-in";
    if (ticketHref) return "ticket";
    return "explanation";
  };

  const primaryControl = (): ReactNode => {
    if (canApply) {
      if (visibleEvent.hasRegistrationQuestions) return <Link className="button" href={`${returnPath}/apply`}>{applyLabel}</Link>;
      return (
        <form action={applyForEventAction} className={styles.form}>
          <input type="hidden" name="eventSlug" value={visibleEvent.slug} />
          <button className="button" type="submit">
            {applyLabel}
          </button>
        </form>
      );
    }
    if (!user && isOpen) {
      return (
        <Link className="button" href={loginHref}>
          Sign in to apply
        </Link>
      );
    }
    if (ticketHref) {
      return (
        <Link className="button" href={ticketHref}>
          View ticket
        </Link>
      );
    }
    return null;
  };

  const registrationPanel = (slot: ActionSlot) => {
    const kind = actionKind();
    const control = primaryControl();
    const messages = stateMessages();
    const explanation = messages.length > 0 ? messages : (
      <p className="registration-help">Registration is closed.</p>
    );

    if (slot === "closing") {
      return (
        <div
          className={styles.closingAction}
          data-registration-slot="closing"
          data-registration-kind={kind}
        >
          {control ?? explanation}
        </div>
      );
    }

    const slotClass = slot === "column" ? styles.columnAction : styles.scheduleAction;
    return (
      <section
        className={`${styles.panel} ${slotClass}`}
        data-registration-slot={slot}
        data-registration-kind={kind}
        aria-labelledby={`${slot}-registration-title`}
      >
        <h2 id={`${slot}-registration-title`}>Your place</h2>
        <p className="availability availability-neutral">
          {isCancelled ? "Event cancelled" : availability.label}
        </p>
        {messages}
        {control}
        <p className="registration-help">
          A place is reserved when you apply. An administrator must confirm
          your application before your place is confirmed.
        </p>
      </section>
    );
  };

  return (
    <>
      <SiteHeader user={user} current="events" />
      <main id="main-content" tabIndex={-1} className={styles.page} data-attendee-glass>
        <p className="back-link">
          <Link href="/">All events</Link>
        </p>

        {isCancelled ? (
          <aside className="event-cancelled-banner" role="alert">
            <strong>This event has been cancelled.</strong>
            <span>
              Registration is closed. The event information remains available
              for reference.
            </span>
          </aside>
        ) : null}

        {result ? (
          <p
            className={`event-result event-result-${result.tone}`}
            role={result.tone === "warning" ? "alert" : "status"}
          >
            {result.message}
          </p>
        ) : null}

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <EventArtwork
              size="detail"
              slug={visibleEvent.slug}
              title={visibleEvent.title}
              coverKey={visibleEvent.coverKey}
              startsAt={visibleEvent.startsAt}
            />
            <div className={styles.heading}>
              <h1 className={styles.title}>{visibleEvent.title}</h1>
              <p className={styles.schedule}>
                <LocalizedSchedule start={visibleEvent.startsAt.toISOString()} end={visibleEvent.endsAt.toISOString()} />
              </p>
              {showUpdated ? (
                <p className={styles.updated}>
                  Updated <LocalizedTimestamp value={visibleEvent.updatedAt.toISOString()} />
                </p>
              ) : null}
            </div>
            {registrationPanel("schedule")}
            <Hosts event={visibleEvent} />
            <Venue event={visibleEvent} />
            {paragraphs.length > 0 ? (
              <section className={styles.section} aria-labelledby="about-event">
                <h2 id="about-event">About this event</h2>
                <div className={styles.descriptionCopy}>
                  {paragraphs.map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ) : null}
            {registrationPanel("closing")}
          </div>
          {registrationPanel("column")}
        </div>
      </main>
    </>
  );
}

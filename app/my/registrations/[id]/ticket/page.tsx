import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { RegistrationStatus, Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { LocalizedTimestamp } from "@/components/localized-time";
import { StatusBadge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import {
  getTicketPresentation,
  type TicketPresentation,
} from "@/services/ticket-service";
import styles from "./ticket.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Event ticket",
  referrer: "no-referrer",
};

type TicketPageProps = { params: Promise<{ id: string }> };

const statusLabels: Record<RegistrationStatus, string> = {
  REGISTERED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  ATTENDED: "Attended",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

function unavailableMessage(ticket: TicketPresentation): ReactNode {
  switch (ticket.unavailableReason) {
    case "event-cancelled":
      return "This event has been cancelled. The ticket cannot be used for check-in.";
    case "event-unavailable":
      return "Tickets are unavailable while this event is unpublished.";
    case "awaiting-confirmation":
      return "Your ticket is unavailable. Please contact the organizer.";
    case "revoked":
      if (ticket.status === "NO_SHOW") {
        return "This registration is marked no-show. There is no usable ticket.";
      }
      if (ticket.status === "CANCELLED") {
        return "This ticket was revoked when the registration was cancelled. A previously saved QR cannot be used.";
      }
      return "This ticket was revoked or is no longer current. A previously saved QR cannot be used.";
  }
}

function nextDestination(
  ticket: TicketPresentation,
  role: Role,
): { href: string; label: string } {
  if (ticket.event.status !== "DRAFT") {
    return {
      href: `/events/${encodeURIComponent(ticket.event.slug)}`,
      label: "View event",
    };
  }

  if (role === "ADMIN") {
    return {
      href: `/admin/events/${encodeURIComponent(ticket.event.id)}`,
      label: "Open event in admin",
    };
  }

  return { href: "/my", label: "Back to my events" };
}

export default async function TicketPage({ params }: TicketPageProps) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const ticket = await getTicketPresentation(id, user);
  if (!ticket) notFound();

  const qrPath = `/api/tickets/${encodeURIComponent(ticket.id)}/qr`;
  const eventPath = `/events/${encodeURIComponent(ticket.event.slug)}`;
  const place = ticket.event.place?.trim() ? ticket.event.place.trim() : null;
  const returnHref = user.role === "ADMIN" ? "/admin" : "/my";
  const returnLabel =
    user.role === "ADMIN" ? "Back to dashboard" : "Back to my events";
  const next = nextDestination(ticket, user.role);

  return (
    <>
      <SiteHeader user={user} current="my" />
      <main id="main-content" tabIndex={-1} className={styles.page}>
        <div className={styles.wrap}>
          <article className={styles.ticket} aria-labelledby="ticket-title">
            <p className={styles.return}>
              <a href={returnHref}>{returnLabel}</a>
            </p>
            <header className={styles.heading}>
              <h1 id="ticket-title">{ticket.event.title}</h1>
              <p className={styles.status}>
                <span className={styles.visuallyHidden}>Registration status: </span>
                <StatusBadge status={ticket.status}>{statusLabels[ticket.status]}</StatusBadge>
              </p>
            </header>

            {ticket.usable ? (
              <div className={styles.plate}>
                {/* The private SVG endpoint stays a native image. Its quiet zone is inside the file. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.qr}
                  src={qrPath}
                  alt="QR code for this event ticket"
                  width={320}
                  height={320}
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className={styles.notice}>
                <p className={styles.unavailable} role="status">
                  {unavailableMessage(ticket)}
                </p>
                <a className="button" href={next.href}>
                  {next.label}
                </a>
              </div>
            )}

            <div className={styles.identity}>
              <p className={styles.name}>
                <span className={styles.visuallyHidden}>Attendee </span>
                {ticket.participantName}
              </p>
              <p className={styles.email}>
                <span className={styles.visuallyHidden}>Email </span>
                {ticket.participantEmail}
              </p>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>Schedule</dt>
                <dd>
                  <LocalizedTimestamp value={ticket.event.startsAt.toISOString()} />
                  {" to "}
                  <LocalizedTimestamp value={ticket.event.endsAt.toISOString()} />
                </dd>
              </div>
              {place ? (
                <div>
                  <dt>Place</dt>
                  <dd>{place}</dd>
                </div>
              ) : null}
            </dl>

            {ticket.usable ? (
              <p className={styles.window}>
                {ticket.phase === "final"
                  ? <>Final verification is available with no deadline.</>
                  : <>Arrival scanning is available at any time. A second scan after <LocalizedTimestamp value={ticket.event.endsAt.toISOString()} /> issues your certificate.</>}
              </p>
            ) : null}

            {ticket.checkedInAt ? (
              <p className={styles.arrival}>
                Arrival was recorded at <LocalizedTimestamp value={ticket.checkedInAt.toISOString()} />. Attendance is confirmed. Your certificate requires a second scan after the event ends to verify onsite presence.
              </p>
            ) : null}

            {ticket.usable ? (
              <p className={styles.instruction}>
                Show this code to the event administrator. Opening or saving
                this ticket does not check you in. An administrator’s arrival scan confirms your attendance; a second scan after the end issues your certificate.
              </p>
            ) : null}

            {ticket.usable ? (
              <div className={styles.actions}>
                <a
                  className="button"
                  href={qrPath}
                  download={`event-ticket-${ticket.id}.svg`}
                  referrerPolicy="no-referrer"
                >
                  Save QR
                </a>
                {ticket.event.status !== "DRAFT" ? (
                  <a className="button button-secondary" href={eventPath}>
                    View event
                  </a>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>
      </main>
    </>
  );
}

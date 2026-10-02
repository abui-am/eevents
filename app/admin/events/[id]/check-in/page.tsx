import { AutomaticTicketScan } from "@/components/automatic-ticket-scan";
import { StatusBadge } from "@/components/ui/badge";
import { ArrivalState, LocalizedSchedule } from "@/components/localized-time";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getUser } from "@/lib/auth";
import { verifyTicketReference } from "@/lib/check-in-tickets";
import { checkInReturnPath } from "@/lib/redirects";
import {
  CHECK_IN_ERROR_MESSAGES,
  getCheckInReview,
} from "@/services/check-in-service";
import {
  confirmQrCheckInAction,
} from "@app/actions/check-in";
import {
  attendanceStateLabel,
  certificateStateLabel,
} from "@app/admin/admin-utils";
import styles from "../../../admin.module.css";

export const metadata: Metadata = {
  title: "Onsite scan",
};
export const dynamic = "force-dynamic";

type CheckInPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ticket?: string | string[];
    result?: string;
    error?: string;
  }>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const resultMessages: Record<string, string> = {
  arrived: "Attendance confirmed. Scan again after the event ends to issue the certificate.",
  "already-arrived": "Attendance was already recorded. Scan again after the event ends for the certificate.",
  certified: "End presence verified. The participant’s certificate has been issued.",
  "already-certified": "This certificate was already issued. Its original link and issue time were kept.",
  already: "This participant was already checked in. The original arrival was kept.",
  undone: "Arrival was undone. The ticket is still valid.",
  "already-undone": "There was no arrival to undo.",
};

function unavailableMessage(reason: string | null): string | null {
  if (reason === "event-cancelled") return "This event was cancelled. Arrival cannot be recorded.";
  if (reason === "event-unavailable") return "This event is not published, so arrival cannot be recorded.";
  return null;
}

function checkInErrorMessage(code: string | undefined): string | null {
  return code && Object.hasOwn(CHECK_IN_ERROR_MESSAGES, code)
    ? CHECK_IN_ERROR_MESSAGES[code as keyof typeof CHECK_IN_ERROR_MESSAGES]
    : null;
}

export default async function AdminCheckInPage({
  params,
  searchParams,
}: CheckInPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ticket = firstValue(query.ticket);
  const payload = verifyTicketReference(ticket);
  if (!payload || payload.eventId !== id) notFound();

  const user = await getUser();
  if (!user) {
    const returnPath = checkInReturnPath(id, ticket);
    if (!returnPath) notFound();
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }
  if (user.role !== "ADMIN") notFound();

  const review = await getCheckInReview(id, ticket);
  if (!review) notFound();

  const resultMessage =
    query.result && Object.hasOwn(resultMessages, query.result)
      ? resultMessages[query.result]
      : undefined;
  const errorMessage = checkInErrorMessage(query.error);
  const closedMessage = unavailableMessage(review.unavailableReason);
  const canSubmit = review.canCheckIn;

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href={`/admin/events/${review.eventId}`}>
          ← Event participants
        </Link>

        <section className={`${styles.formPanel} ${styles.eventSummary}`} aria-labelledby="check-in-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator onsite scan</p>
          <h1 id="check-in-title">{review.eventTitle}</h1>
          <p><LocalizedSchedule start={review.startsAt.toISOString()} end={review.endsAt.toISOString()} compact /></p>

          {resultMessage ? (
            <p className={`${styles.message} ${styles.successMessage}`} role="status">{resultMessage}</p>
          ) : null}
          {errorMessage ? <p className={styles.message} role="alert">{errorMessage}</p> : null}
          {closedMessage ? <p className={styles.notice} role="status">{closedMessage}</p> : null}

          <dl className={styles.participantDetails}>
            <div>
              <dt>Participant</dt>
              <dd>{review.participantName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{review.participantEmail}</dd>
            </div>
            <div>
              <dt>Registration</dt>
              <dd><StatusBadge status={review.registrationStatus}>{review.registrationStatus === "ATTENDED" ? "Attended" : review.registrationStatus === "REGISTERED" ? "Registered" : "Confirmed"}</StatusBadge></dd>
            </div>
            <div>
              <dt>Arrival</dt>
              <dd>
                <ArrivalState value={review.checkedInAt?.toISOString() ?? null} />
                {review.checkedInAt && review.checkedInByName ? ` · recorded by ${review.checkedInByName}` : null}
              </dd>
            </div>
            <div>
              <dt>Attendance</dt>
              <dd>{attendanceStateLabel(review.registrationStatus)}</dd>
            </div>
            <div>
              <dt>Certificate</dt>
              <dd>
                {review.certificateHref ? <Link href={review.certificateHref}>View certificate</Link> : certificateStateLabel(
                  review.registrationStatus, review.certificateKey, review.certificateUploadedAt,
                )}
              </dd>
            </div>
          </dl>

          {review.endPresenceAt ? <p>End presence verified: <ArrivalState value={review.endPresenceAt.toISOString()} /></p> : null}
          {canSubmit && !query.result && !query.error ? <AutomaticTicketScan eventId={id} ticket={ticket!} /> : null}
          {canSubmit ? (
            <noscript><form action={confirmQrCheckInAction} className={styles.formActions}>
              <input type="hidden" name="eventId" value={review.eventId} />
              <input type="hidden" name="ticket" value={ticket} />
              <button className={styles.button} type="submit">{review.phase === "final" ? "Verify end presence" : "Record attendance"}</button>
            </form></noscript>
          ) : null}
        </section>
      </main>
    </>
  );
}

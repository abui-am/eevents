import { StatusBadge } from "@/components/ui/badge";
import { QrCheckInScanner } from "@/components/qr-check-in-scanner";
import { ArrivalState, LocalizedSchedule, LocalizedTimestamp } from "@/components/localized-time";
import { ValidatedForm, ValidatedInput, SubmitButton } from "@/components/validated-form";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { setAdminRegistrationStatusAction } from "@app/actions/admin-events";
import { manualCheckInAction } from "@app/actions/check-in";
import {
  adminErrorMessage,
  attendanceStateLabel,
  certificateStateLabel,
  eventStatusLabel,
  searchHref,
} from "@app/admin/admin-utils";
import { requireAdmin } from "@/lib/auth";
import {
  getAdminEventParticipants,
  ADMIN_PAGE_SIZE,
  type ArrivalFilter,
} from "@/services/admin-event-service";
import type { RegistrationStatus } from "@prisma/client";
import { CHECK_IN_ERROR_MESSAGES } from "@/services/check-in-service";
import styles from "../../admin.module.css";
import { AnswerFilters } from "@/components/answer-filters";
import { decodeAnswerFilters, type AnswerFilter } from "@/lib/questionnaire";
import { QuestionnaireError } from "@/services/questionnaire-service";
import questionnaireStyles from "@/components/questionnaire.module.css";

export const metadata: Metadata = { title: "Event participants" };

const STATUS_FILTERS = [
  "REGISTERED",
  "CONFIRMED",
  "ATTENDED",
  "NO_SHOW",
  "CANCELLED",
] as const satisfies readonly RegistrationStatus[];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  REGISTERED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  ATTENDED: "Attended",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

function emptyHeading(status: RegistrationStatus | undefined, hasQuery: boolean): string {
  if (hasQuery) return "No matching participants";
  if (status === "REGISTERED") return "No participants awaiting confirmation";
  if (status === "CONFIRMED") return "No confirmed participants";
  if (status === "ATTENDED") return "No attended participants";
  if (status === "NO_SHOW") return "No participants marked no-show";
  if (status === "CANCELLED") return "No cancelled registrations";
  return "No registrations yet";
}

type EventPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string | string[];
    status?: string | string[];
    arrival?: string | string[];
    q?: string | string[];
    filters?: string | string[];
    statusError?: string;
    statusSaved?: string;
    saved?: string;
    checkInError?: string;
    checkInResult?: string;
  }>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | string[] | undefined): number {
  const raw = firstValue(value);
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function selectedStatus(value: string | string[] | undefined): RegistrationStatus | undefined {
  const raw = firstValue(value);
  return STATUS_FILTERS.find((status) => status === raw);
}

function selectedArrival(value: string | string[] | undefined): ArrivalFilter | undefined {
  const raw = firstValue(value);
  return raw === "checked-in" || raw === "not-checked-in" ? raw : undefined;
}

function registrationLabel(
  status: RegistrationStatus,
  cancelledBy: "PARTICIPANT" | "ADMIN" | null,
): string {
  if (status === "CANCELLED" && cancelledBy === "ADMIN") return "Registration declined";
  if (status === "CANCELLED" && cancelledBy === "PARTICIPANT") return "Cancelled by participant";
  return STATUS_LABELS[status];
}

function statusActionButtons(
  eventId: string,
  registrationId: string,
  status: RegistrationStatus,
  cancelledBy: "PARTICIPANT" | "ADMIN" | null,
  checkedInAt: Date | null,
  eventStatus: string,
  startsAt: Date,
  endsAt: Date,
) {
  const now = new Date();
  const started = now >= startsAt;
  const ended = now >= endsAt;
  const canMutate = eventStatus === "PUBLISHED";
  const actions: Array<{ status: RegistrationStatus; label: string; danger?: boolean }> = [];

  if (canMutate && status === "REGISTERED" && !started) {
    actions.push({ status: "CONFIRMED", label: "Confirm" });
    actions.push({ status: "CANCELLED", label: "Decline", danger: true });
  }
  if (canMutate && status === "CONFIRMED") {
    if (started) actions.push({ status: "ATTENDED", label: "Mark attended" });
    if (ended && !checkedInAt) actions.push({ status: "NO_SHOW", label: "Mark no-show", danger: true });
    if (!started) actions.push({ status: "CANCELLED", label: "Cancel", danger: true });
  }
  if (canMutate && status === "CANCELLED" && cancelledBy === "ADMIN" && !started) {
    actions.push({ status: "REGISTERED", label: "Reopen" });
  }

  if (actions.length === 0) return null;

  return actions.map((action) => (
    <form action={setAdminRegistrationStatusAction} key={action.status}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="nextStatus" value={action.status} />
      <button className={action.danger ? styles.dangerButton : styles.smallButton} type="submit">
        {action.label}
      </button>
    </form>
  ));
}

function arrivalActionButtons(
  eventId: string,
  registrationId: string,
  status: RegistrationStatus,
  checkedInAt: Date | null,
  eventStatus: string,
) {
  const canCheckIn = eventStatus === "PUBLISHED";
  if (!canCheckIn) return null;

  if ((status === "REGISTERED" || status === "CONFIRMED" || status === "ATTENDED") && !checkedInAt) {
    return (
      <form action={manualCheckInAction}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="registrationId" value={registrationId} />
        <button className={styles.smallButton} type="submit">Check in manually</button>
      </form>
    );
  }

  return null;
}

export default async function AdminEventPage({ params, searchParams }: EventPageProps) {
  const user = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const status = selectedStatus(query.status);
  const arrival = selectedArrival(query.arrival);
  const invalidFilters = () => <><SiteHeader user={user} current="admin" /><main id="main-content" tabIndex={-1} className={styles.shell}><h1>Invalid answer filters</h1><p role="alert">The filters contain an invalid question, option, or condition. Clear them and choose filters from this event.</p><Link className={styles.secondaryButton} href={`/admin/events/${id}`}>Clear filters</Link></main></>;
  let answerFilters: AnswerFilter[];
  try { answerFilters = decodeAnswerFilters(firstValue(query.filters)); } catch { return invalidFilters(); }
  let result;
  try { result = await getAdminEventParticipants(id, {
    page: pageNumber(query.page),
    status,
    arrival,
    query: firstValue(query.q),
    answerFilters,
  }); } catch (error) { if (error instanceof QuestionnaireError) return invalidFilters(); throw error; }
  if (!result) notFound();

  const { event } = result;
  const basePath = `/admin/events/${event.id}`;
  const activeCount = result.activeRegistrationCount;
  const filters = answerFilters.length ? JSON.stringify(answerFilters) : undefined;
  const allCount = Object.values(result.statusCounts).reduce((sum, count) => sum + count, 0);
  const statusError = adminErrorMessage(firstValue(query.statusError));
  const checkInError = query.checkInError && Object.hasOwn(CHECK_IN_ERROR_MESSAGES, query.checkInError)
    ? CHECK_IN_ERROR_MESSAGES[query.checkInError as keyof typeof CHECK_IN_ERROR_MESSAGES]
    : null;
  const checkInResultMessages: Record<string, string> = {
    arrived: "Participant attendance confirmed. Scan again after the end for the certificate.",
    "already-arrived": "Attendance was already recorded. The original arrival was kept.",
    certified: "End presence verified and certificate issued.",
    "already-certified": "Certificate already issued. The original link was kept.",
  };
  const checkInResult = query.checkInResult && Object.hasOwn(checkInResultMessages, query.checkInResult)
    ? checkInResultMessages[query.checkInResult]
    : null;

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href="/admin">← All events</Link>
        {query.saved && <p className={`${styles.message} ${styles.successMessage}`} role="status">Event changes saved.</p>}
        {query.statusSaved && <p className={`${styles.message} ${styles.successMessage}`} role="status">Participant status updated.</p>}
        {checkInResult && <p className={`${styles.message} ${styles.successMessage}`} role="status">{checkInResult}</p>}
        {checkInError && <p className={styles.message} role="alert">{checkInError}</p>}
        {statusError && <p className={styles.message} role="alert">{statusError}</p>}

        <section className={`${styles.panel} ${styles.eventSummary}`} aria-labelledby="event-title">
          <div className={styles.eventHeading}>
            <div>
              <p className={`eyebrow ${styles.eyebrow}`}>Event operations</p>
              <h1 id="event-title">{event.title}</h1>
            </div>
            <StatusBadge status={event.status}>
              {eventStatusLabel(event.status)}
            </StatusBadge>
          </div>
          <p><LocalizedSchedule start={event.startsAt.toISOString()} end={event.endsAt.toISOString()} compact /></p>
          <p>Last updated <LocalizedTimestamp value={event.updatedAt.toISOString()} compact /></p>
          <p>{event.status === "CANCELLED" ? "This event is cancelled. Participant records remain available to administrators." : `${activeCount} active registrations · ${event.capacity} seats`}</p>
          {event.status === "CANCELLED" && (
            <p className={styles.notice} role="status">Cancelled events cannot be reopened. Registration and certificate records have been retained.</p>
          )}
          <p className={styles.summaryDescription}>{event.description}</p>
          {event.coverKey ? (
            <img
              className={styles.coverPreview}
              src={`/events/${encodeURIComponent(event.slug)}/cover`}
              alt={event.title}
              width={96}
              height={96}
            />
          ) : null}
          {event.hosts.length > 0 ? (
            <div className={styles.summaryHosts}>
              <h2 className={styles.summaryHeading}>Hosts</h2>
              <ul className={styles.hostList}>
                {event.hosts.map((host) => (
                  <li key={host.id}>
                    {host.avatarKey ? (
                      <img
                        className={styles.hostAvatar}
                        src={`/events/${encodeURIComponent(event.slug)}/hosts/${encodeURIComponent(host.id)}/avatar`}
                        alt=""
                        width={40}
                        height={40}
                      />
                    ) : null}
                    <span>{host.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={styles.formActions}>
            <Link className={styles.secondaryButton} href={`${basePath}/edit`}>Edit event</Link>
            <Link className={styles.secondaryButton} href={`${basePath}/questions`}>Registration questions</Link>
          </div>
        </section>

        <QrCheckInScanner eventId={id} />

        <section className={styles.section} aria-labelledby="participants-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={`eyebrow ${styles.eyebrow}`}>Private administrator view</p>
              <h2 id="participants-title">Participants</h2>
            </div>
            <p className={styles.summary}>
              {result.total} {result.total === 1 ? "record" : "records"} in this view · page {result.page} of {result.pageCount}
            </p>
          </div>

          <nav className={styles.statusTabs} aria-label="Filter participants by status">
            <Link className={styles.statusTab} aria-current={!status ? "page" : undefined} href={searchHref(basePath, { status: "ALL", arrival: arrival ?? "ALL", query: result.query, filters })}>
              All <span className={styles.tabCount}>{allCount}</span>
            </Link>
            {STATUS_FILTERS.map((item) => (
              <Link
                className={styles.statusTab}
                aria-current={status === item ? "page" : undefined}
                href={searchHref(basePath, { status: item, arrival: arrival ?? "ALL", query: result.query, filters })}
                key={item}
              >
                {STATUS_LABELS[item]} <span className={styles.tabCount}>{result.statusCounts[item]}</span>
              </Link>
            ))}
          </nav>

          <AnswerFilters key={filters ?? "none"} questions={result.filterQuestions} filters={answerFilters} basePath={basePath} status={status} arrival={arrival} query={result.query} />
          {answerFilters.length > 0 && <div className={questionnaireStyles.chips} aria-label="Active answer filters">
            {answerFilters.map((filter, index) => {
              const question = result.filterQuestions.find((item) => item.id === filter.questionId)!;
              const condition = filter.operator === "contains" ? `contains “${filter.value}”` : filter.operator === "any" ? `matches ${question.options.filter((option) => filter.optionIds?.includes(option.id)).map((option) => option.label).join(" or ")}` : ({ answered: "answered", unanswered: "not answered", yes: "Yes", no: "No" }[filter.operator] ?? filter.operator);
              const remaining = answerFilters.filter((_, position) => position !== index);
              return <span key={question.id} className={questionnaireStyles.chip}><span>{question.label}: {condition}</span><Link aria-label={`Remove filter for ${question.label}`} href={searchHref(basePath, { status, arrival, query: result.query, filters: remaining.length ? JSON.stringify(remaining) : undefined })}>Remove</Link></span>;
            })}
            <Link className={questionnaireStyles.back} href={basePath}>Clear all filters</Link>
          </div>}

          <div className={styles.filterBar}>
            <ValidatedForm schema="search" defaults={{ q: result.query }} className={styles.searchForm} method="get" action={basePath} role="search">
              {status && <input type="hidden" name="status" value={status} />}
              {arrival && <input type="hidden" name="arrival" value={arrival} />}
              {filters && <input type="hidden" name="filters" value={filters} />}
              <label className={styles.visuallyHidden} htmlFor="participant-search">Search name or email</label>
              <ValidatedInput
                className={styles.searchInput}
                id="participant-search"
                name="q"
                type="search"
                maxLength={100}
                defaultValue={result.query}
                placeholder="Search name or email"
              />
              <SubmitButton variant="secondary" className={styles.secondaryButton} pendingLabel="Searching…">Search</SubmitButton>
            </ValidatedForm>
          </div>

          <nav className={styles.statusTabs} aria-label="Filter participants by arrival">
            <Link className={styles.statusTab} aria-current={!arrival ? "page" : undefined} href={searchHref(basePath, { status: status ?? "ALL", query: result.query, filters })}>
              Any arrival
            </Link>
            <Link className={styles.statusTab} aria-current={arrival === "checked-in" ? "page" : undefined} href={searchHref(basePath, { status: status ?? "ALL", arrival: "checked-in", query: result.query, filters })}>
              Arrival recorded
            </Link>
            <Link className={styles.statusTab} aria-current={arrival === "not-checked-in" ? "page" : undefined} href={searchHref(basePath, { status: status ?? "ALL", arrival: "not-checked-in", query: result.query, filters })}>
              No arrival recorded
            </Link>
          </nav>

          {result.registrations.length > 0 ? (
            <table className={styles.participantTable} role="table">
              <caption className={styles.visuallyHidden}>Event participants and attendance</caption>
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col">Registration</th>
                  <th scope="col">Arrival</th>
                  <th scope="col">Attendance</th>
                  <th scope="col">Certificate</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.registrations.map((registration) => (
                  <tr key={registration.id}>
                    <th scope="row" data-label="Participant">
                      <p className={styles.participantName}>{registration.participant.name}</p>
                      <p className={styles.participantEmail}>{registration.participant.email}</p>
                    </th>
                    <td data-label="Registration">
                      <StatusBadge status={registration.status}>
                        {registrationLabel(registration.status, registration.cancelledBy)}
                      </StatusBadge>
                      <p className={styles.registrationTime}>Registered <LocalizedTimestamp value={registration.createdAt.toISOString()} compact /></p>
                    </td>
                    <td data-label="Arrival">
                      <ArrivalState value={registration.checkedInAt?.toISOString() ?? null} />
                    </td>
                    <td data-label="Attendance">
                      {attendanceStateLabel(registration.status)}
                    </td>
                    <td data-label="Certificate">
                      {registration.certificate ? "Certificate issued" : certificateStateLabel(
                        registration.status, registration.certificateKey, registration.certificateUploadedAt,
                      )}
                      {registration.endPresenceAt ? <p>End presence verified</p> : null}
                    </td>
                    <td data-label="Actions">
                      <div className={styles.actionRow}>
                        <Link className={styles.secondaryButton} href={`${basePath}/registrations/${registration.id}/answers`}>View answers</Link>
                        {statusActionButtons(
                          event.id,
                          registration.id,
                          registration.status,
                          registration.cancelledBy,
                          registration.checkedInAt,
                          event.status,
                          event.startsAt,
                          event.endsAt,
                        ) ?? (
                          registration.status === "CANCELLED" && registration.cancelledBy === "PARTICIPANT" ? (
                            <span className={styles.mutedText}>
                              {event.status === "PUBLISHED" && event.startsAt > new Date()
                                ? "Cancelled by participant; they may reapply before the event starts."
                                : "Cancelled by participant."}
                            </span>
                          ) : registration.status === "CONFIRMED" && event.status === "PUBLISHED" ? (
                            <span className={styles.mutedText}>Arrival can be recorded at any time; no-show after the event ends.</span>
                          ) : registration.status === "REGISTERED" && event.startsAt <= new Date() ? (
                            <span className={styles.mutedText}>Scan the participant’s QR to record onsite attendance.</span>
                          ) : registration.status === "CANCELLED" && registration.cancelledBy === "ADMIN" && event.status === "PUBLISHED" && event.startsAt <= new Date() ? (
                            <span className={styles.mutedText}>This registration cannot be reopened after the event starts.</span>
                          ) : null
                        )}
                        {arrivalActionButtons(
                          event.id,
                          registration.id,
                          registration.status,
                          registration.checkedInAt,
                          event.status,
                        )}
                        {registration.certificate ? (
                          <Link className={styles.secondaryButton} href={`/certificates/${registration.certificate.token}`}>View certificate</Link>
                        ) : registration.certificateKey && registration.certificateUploadedAt ? (
                          <Link className={styles.secondaryButton} href={`/api/certificates/${encodeURIComponent(registration.id)}`}>Download existing PDF</Link>
                        ) : registration.status === "ATTENDED" ? (
                          <Link className={styles.secondaryButton} href={`/admin/registrations/${encodeURIComponent(registration.id)}/certificate`}>Certificate status</Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyState}>
              <strong>{emptyHeading(status, Boolean(result.query || filters))}</strong>
              {result.query || filters ? "Try another search or remove an answer filter." : "Participant records will appear here when people register."}
            </div>
          )}

          {result.pageCount > 1 && (
            <nav className={styles.pager} aria-label="Participant pages">
              {result.page > 1 ? (
                <Link href={searchHref(basePath, { page: result.page - 1, status: status ?? "ALL", arrival: arrival ?? "ALL", query: result.query, filters })}>Previous</Link>
              ) : (
                <span className={styles.pagerSpacer} />
              )}
              <span>Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? (
                <Link href={searchHref(basePath, { page: result.page + 1, status: status ?? "ALL", arrival: arrival ?? "ALL", query: result.query, filters })}>Next</Link>
              ) : (
                <span className={styles.pagerSpacer} />
              )}
            </nav>
          )}
          <p className={styles.mutedText}>Showing up to {ADMIN_PAGE_SIZE} records per page. Personal details are visible only in this protected administrator view.</p>
        </section>
      </main>
    </>
  );
}

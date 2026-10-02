import { ScheduleFields } from "@/components/schedule-fields";
import { ValidatedForm, ValidatedInput, ValidatedTextarea, ValidatedSelect, SubmitButton } from "@/components/validated-form";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { updateAdminEventAction } from "@app/actions/admin-events";
import {
  moveEventHostDownAction,
  moveEventHostUpAction,
  removeEventHostFormAction,
} from "@app/actions/admin-hosts";
import { replaceEventCoverAction } from "@app/actions/event-media";
import {
  adminErrorMessage,
  enteredEventFields,
  firstQueryValue,
  formatUtcInput,
  hostErrorMessage,
  imageErrorMessage,
} from "@app/admin/admin-utils";
import { StoredImageForm } from "../../stored-image-form";
import { requireAdmin } from "@/lib/auth";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import { getAdminEvent } from "@/services/admin-event-service";
import { VenueFields } from "../../venue-fields";
import styles from "../../../admin.module.css";

export const metadata: Metadata = { title: "Edit event" };

type EditEventPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
    title?: string | string[];
    description?: string | string[];
    location?: string | string[];
    startsAt?: string | string[];
    endsAt?: string | string[];
    timeZone?: string | string[];
    capacity?: string | string[];
    status?: string | string[];
    venueName?: string | string[];
    venueAddress?: string | string[];
    mapUrl?: string | string[];
    hostError?: string | string[];
    hostSaved?: string | string[];
    imageError?: string | string[];
    imageSaved?: string | string[];
  }>;
};

function statusChoice(status: string, fallback: string): string {
  if (status === "DRAFT" || status === "PUBLISHED" || status === "CANCELLED") return status;
  return fallback;
}

export default async function EditEventPage({ params, searchParams }: EditEventPageProps) {
  const user = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const event = await getAdminEvent(id);
  if (!event) notFound();

  const error = firstQueryValue(query.error);
  const errorMessage = adminErrorMessage(error);
  const hostError = hostErrorMessage(firstQueryValue(query.hostError));
  const hostSaved = firstQueryValue(query.hostSaved) === "1";
  const imageError = imageErrorMessage(firstQueryValue(query.imageError));
  const imageSaved = !imageError && firstQueryValue(query.imageSaved) === "1";
  const fields = enteredEventFields(error, query, {
    title: event.title,
    description: event.description,
    location: event.location ?? "",
    startsAt: formatUtcInput(event.startsAt),
    endsAt: formatUtcInput(event.endsAt),
    timeZone: "UTC",
    capacity: String(event.capacity),
    status: event.status,
    venueName: event.venueName ?? "",
    venueAddress: event.venueAddress ?? "",
    mapUrl: event.mapUrl ?? "",
  });
  const scheduleReference = { startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() };
  const scheduleLocked = event.startsAt <= new Date();
  const eventCancelled = event.status === "CANCELLED";
  const atHostCap = event.hosts.length >= EVENT_CONTENT_LIMITS.maxHosts;

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href={`/admin/events/${event.id}`}>
          ← Event participants
        </Link>
        <section className={styles.formPanel} aria-labelledby="edit-event-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
          <h1 id="edit-event-title">Edit event</h1>
          <p className={styles.formIntro}>
            Changes will be visible to participants. Use your device timezone or choose UTC for the schedule.
          </p>
          {errorMessage && <p className={styles.message} role="alert">{errorMessage}</p>}
          {imageError ? <p className={styles.message} role="alert">{imageError}</p> : null}
          {imageSaved ? (
            <p className={`${styles.message} ${styles.successMessage}`} role="status">
              Cover image saved.
            </p>
          ) : null}
          {scheduleLocked && (
            <p className={styles.notice}>
              This event has started. Its schedule is locked, but the other details can still be updated.
            </p>
          )}

          <ValidatedForm schema="event" defaults={{ ...fields, status: statusChoice(fields.status, event.status) }} className={styles.formStack} scheduleReference={scheduleReference} preservedTimeZone={error ? fields.timeZone : undefined} action={updateAdminEventAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <div className={styles.field}>
              <label htmlFor="title">Event title (required)</label>
              <ValidatedInput id="title" name="title" defaultValue={fields.title} required minLength={3} maxLength={160} />
            </div>
            <div className={styles.field}>
              <label htmlFor="description">Description (required)</label>
              <ValidatedTextarea id="description" name="description" defaultValue={fields.description} required maxLength={10000} />
            </div>
            <div className={styles.field}>
              <label htmlFor="location">Location</label>
              <ValidatedInput id="location" name="location" aria-describedby="location-help" defaultValue={fields.location} maxLength={200} />
              <p className={styles.fieldHint} id="location-help">Leave blank if the location is still to be announced.</p>
            </div>
            <VenueFields
              venueName={fields.venueName}
              venueAddress={fields.venueAddress}
              mapUrl={fields.mapUrl}
            />
            <ScheduleFields locked={scheduleLocked} reference={scheduleReference} />
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <label htmlFor="capacity">Capacity (required)</label>
                <ValidatedInput id="capacity" name="capacity" type="number" min={1} max={100000} step={1} defaultValue={fields.capacity} required />
              </div>
              <div className={styles.field}>
                <label htmlFor="status">Event status</label>
                {eventCancelled ? (
                  <>
                    <input type="hidden" name="status" value="CANCELLED" />
                    <input id="status" value="Cancelled — final" readOnly />
                  </>
                ) : (
                  <ValidatedSelect id="status" name="status" defaultValue={statusChoice(fields.status, event.status)} required>
                    <option value="DRAFT">Draft — hidden from participants</option>
                    <option value="PUBLISHED">Published — visible to participants</option>
                    <option value="CANCELLED">Cancelled — final</option>
                  </ValidatedSelect>
                )}
                {!eventCancelled && (
                  <p className={styles.fieldHint}>
                    Cancelling is final. Participant and certificate records will be retained.
                  </p>
                )}
              </div>
            </div>
            <div className={styles.formActions}>
              <SubmitButton className={styles.button} pendingLabel="Saving event…">Save changes</SubmitButton>
              <Link className={styles.secondaryButton} href={`/admin/events/${event.id}`}>Cancel</Link>
            </div>
          </ValidatedForm>
        </section>

        <section className={`${styles.formPanel} ${styles.hostPanel}`} aria-labelledby="cover-title">
          <div className={styles.sectionHeading}>
            <h2 id="cover-title">Cover image</h2>
          </div>
          {event.coverKey ? (
            <img
              className={styles.imagePreview}
              src={`/events/${encodeURIComponent(event.slug)}/cover`}
              alt=""
              width={128}
              height={128}
            />
          ) : (
            <p className={styles.mutedText}>No cover image yet.</p>
          )}
          <StoredImageForm
            action={replaceEventCoverAction}
            eventId={event.id}
            expectedKey={event.coverKey}
            inputId="cover-image"
            label={event.coverKey ? "Replace cover" : "Upload cover"}
            submitLabel={event.coverKey ? "Replace cover" : "Upload cover"}
          />
          {event.coverKey ? (
            <div className={styles.formActions}>
              <Link className={styles.dangerButton} href={`/admin/events/${event.id}/cover/remove`}>
                Remove cover
              </Link>
            </div>
          ) : null}
        </section>

        <section id="hosts" className={`${styles.formPanel} ${styles.hostPanel}`} aria-labelledby="hosts-title">
          <div className={styles.sectionHeading}>
            <h2 id="hosts-title">Hosts</h2>
            {atHostCap ? null : (
              <Link className={styles.secondaryButton} href={`/admin/events/${event.id}/hosts/new`}>
                Add host
              </Link>
            )}
          </div>
          <p className={styles.summary}>
            {event.hosts.length} of {EVENT_CONTENT_LIMITS.maxHosts} hosts, in display order.
          </p>
          {hostError ? <p className={styles.message} role="alert">{hostError}</p> : null}
          {hostSaved && !hostError ? (
            <p className={`${styles.message} ${styles.successMessage}`} role="status">Hosts updated.</p>
          ) : null}
          {atHostCap ? (
            <p className={styles.notice}>An event can have at most 10 hosts.</p>
          ) : null}
          {event.hosts.length > 0 ? (
            <ol className={styles.eventList}>
              {event.hosts.map((host, index) => (
                <li className={styles.eventCard} key={host.id}>
                  <div className={styles.eventHeading}>
                    <h3>
                      <Link href={`/admin/events/${event.id}/hosts/${host.id}`}>{host.name}</Link>
                    </h3>
                  </div>
                  <div className={styles.hostActions}>
                    <Link className={styles.smallButton} href={`/admin/events/${event.id}/hosts/${host.id}`}>
                      Edit
                      <span className={styles.visuallyHidden}> {host.name}</span>
                    </Link>
                    <form action={moveEventHostUpAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="hostId" value={host.id} />
                      <button className={styles.smallButton} type="submit" disabled={index === 0}>
                        Move up
                        <span className={styles.visuallyHidden}> {host.name}</span>
                      </button>
                    </form>
                    <form action={moveEventHostDownAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="hostId" value={host.id} />
                      <button
                        className={styles.smallButton}
                        type="submit"
                        disabled={index === event.hosts.length - 1}
                      >
                        Move down
                        <span className={styles.visuallyHidden}> {host.name}</span>
                      </button>
                    </form>
                    <form action={removeEventHostFormAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="hostId" value={host.id} />
                      <button className={styles.dangerButton} type="submit">
                        Remove
                        <span className={styles.visuallyHidden}> {host.name}</span>
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.mutedText}>No hosts yet.</p>
          )}
        </section>
      </main>
    </>
  );
}

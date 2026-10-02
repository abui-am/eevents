import { ScheduleFields } from "@/components/schedule-fields";
import { ValidatedForm, ValidatedInput, ValidatedTextarea, ValidatedSelect, SubmitButton } from "@/components/validated-form";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { createAdminEventAction } from "@app/actions/admin-events";
import {
  BLANK_EVENT_FORM,
  adminErrorMessage,
  enteredEventFields,
  firstQueryValue,
} from "@app/admin/admin-utils";
import { requireAdmin } from "@/lib/auth";
import { VenueFields } from "../venue-fields";
import styles from "../../admin.module.css";

export const metadata: Metadata = { title: "Create event" };

type NewEventPageProps = {
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
  }>;
};

export default async function NewEventPage({ searchParams }: NewEventPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;
  const error = firstQueryValue(params.error);
  const errorMessage = adminErrorMessage(error);
  const fields = enteredEventFields(error, params, BLANK_EVENT_FORM);
  const status = fields.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.eventEditor}`}>
        <Link className={styles.backLink} href="/admin">← All events</Link>
        <section className={styles.formPanel} aria-labelledby="create-event-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
          <h1 id="create-event-title">Create an event</h1>
          <p className={styles.formIntro}>
            Set the schedule, location, venue, registration limit, and visibility.
          </p>
          {errorMessage && <p className={styles.message} role="alert">{errorMessage}</p>}

          <ValidatedForm schema="event" defaults={{ ...fields, status }} className={styles.formStack} preservedTimeZone={error ? fields.timeZone : undefined} action={createAdminEventAction}>
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
            <ScheduleFields />
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <label htmlFor="capacity">Capacity (required)</label>
                <ValidatedInput id="capacity" name="capacity" type="number" min={1} max={100000} step={1} defaultValue={fields.capacity} required />
              </div>
              <div className={styles.field}>
                <label htmlFor="status">Visibility</label>
                <ValidatedSelect id="status" name="status" defaultValue={status} required>
                  <option value="DRAFT">Draft — hidden from participants</option>
                  <option value="PUBLISHED">Published — visible to participants</option>
                </ValidatedSelect>
              </div>
            </div>
            <div className={styles.formActions}>
              <SubmitButton className={styles.button} pendingLabel="Saving event…">Create event</SubmitButton>
              <Link className={styles.secondaryButton} href="/admin">Cancel</Link>
            </div>
          </ValidatedForm>
        </section>
      </main>
    </>
  );
}

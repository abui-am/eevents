import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { updateEventHostAction } from "@app/actions/admin-hosts";
import { replaceHostAvatarAction } from "@app/actions/event-media";
import {
  enteredHostFields,
  firstQueryValue,
  hostErrorMessage,
  imageErrorMessage,
} from "@app/admin/admin-utils";
import { StoredImageForm } from "../../../stored-image-form";
import { requireAdmin } from "@/lib/auth";
import { getAdminEvent } from "@/services/admin-event-service";
import { HostDetailsForm } from "../host-form";
import styles from "../../../../admin.module.css";

export const metadata: Metadata = { title: "Edit host" };

type EditHostPageProps = {
  params: Promise<{ id: string; hostId: string }>;
  searchParams: Promise<{
    error?: string | string[];
    saved?: string | string[];
    name?: string | string[];
    biography?: string | string[];
    publicEmail?: string | string[];
    imageError?: string | string[];
    imageSaved?: string | string[];
  }>;
};

export default async function EditHostPage({ params, searchParams }: EditHostPageProps) {
  const user = await requireAdmin();
  const [{ id, hostId }, query] = await Promise.all([params, searchParams]);
  const event = await getAdminEvent(id);
  const host = event?.hosts.find((item) => item.id === hostId);
  if (!event || !host) notFound();

  const error = firstQueryValue(query.error);
  const errorMessage = hostErrorMessage(error);
  const saved = !errorMessage && firstQueryValue(query.saved) === "1";
  const imageError = imageErrorMessage(firstQueryValue(query.imageError));
  const imageSaved = !imageError && firstQueryValue(query.imageSaved) === "1";
  const values = enteredHostFields(error, query, {
    name: host.name,
    biography: host.biography ?? "",
    publicEmail: host.publicEmail ?? "",
  });
  const editHref = `/admin/events/${event.id}/edit#hosts`;

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href={editHref}>← Edit event</Link>
        <section className={styles.formPanel} aria-labelledby="edit-host-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
          <h1 id="edit-host-title">Edit host</h1>
          <p className={styles.formIntro}>Host for {event.title}.</p>
          {errorMessage ? <p className={styles.message} role="alert">{errorMessage}</p> : null}
          {saved ? (
            <p className={`${styles.message} ${styles.successMessage}`} role="status">Host saved.</p>
          ) : null}
          {imageError ? <p className={styles.message} role="alert">{imageError}</p> : null}
          {imageSaved ? (
            <p className={`${styles.message} ${styles.successMessage}`} role="status">Avatar saved.</p>
          ) : null}
          <HostDetailsForm
            action={updateEventHostAction}
            eventId={event.id}
            hostId={host.id}
            values={values}
            submitLabel="Save host"
            cancelHref={editHref}
          />
        </section>

        <section className={`${styles.formPanel} ${styles.hostPanel}`} aria-labelledby="avatar-title">
          <div className={styles.sectionHeading}>
            <h2 id="avatar-title">Avatar</h2>
          </div>
          {host.avatarKey ? (
            <img
              className={styles.imagePreview}
              src={`/events/${encodeURIComponent(event.slug)}/hosts/${encodeURIComponent(host.id)}/avatar`}
              alt=""
              width={128}
              height={128}
            />
          ) : (
            <p className={styles.mutedText}>No avatar yet.</p>
          )}
          <StoredImageForm
            action={replaceHostAvatarAction}
            eventId={event.id}
            hostId={host.id}
            expectedKey={host.avatarKey}
            inputId="avatar-image"
            label={host.avatarKey ? "Replace avatar" : "Upload avatar"}
            submitLabel={host.avatarKey ? "Replace avatar" : "Upload avatar"}
          />
          {host.avatarKey ? (
            <div className={styles.formActions}>
              <Link
                className={styles.dangerButton}
                href={`/admin/events/${event.id}/hosts/${host.id}/avatar/remove`}
              >
                Remove avatar
              </Link>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

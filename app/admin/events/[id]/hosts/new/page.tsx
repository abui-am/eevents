import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createEventHostAction } from "@app/actions/admin-hosts";
import {
  enteredHostFields,
  firstQueryValue,
  hostErrorMessage,
} from "@app/admin/admin-utils";
import { requireAdmin } from "@/lib/auth";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import { getAdminEvent } from "@/services/admin-event-service";
import { HostDetailsForm } from "../host-form";
import styles from "../../../../admin.module.css";

export const metadata: Metadata = { title: "Add host" };

type NewHostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
    name?: string | string[];
    biography?: string | string[];
    publicEmail?: string | string[];
  }>;
};

export default async function NewHostPage({ params, searchParams }: NewHostPageProps) {
  const user = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const event = await getAdminEvent(id);
  if (!event) notFound();

  const error = firstQueryValue(query.error);
  const errorMessage = hostErrorMessage(error);
  const values = enteredHostFields(error, query, {
    name: "",
    biography: "",
    publicEmail: "",
  });
  const atCap = event.hosts.length >= EVENT_CONTENT_LIMITS.maxHosts;
  const editHref = `/admin/events/${event.id}/edit#hosts`;

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href={editHref}>← Edit event</Link>
        <section className={styles.formPanel} aria-labelledby="add-host-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
          <h1 id="add-host-title">Add a host</h1>
          <p className={styles.formIntro}>Host for {event.title}.</p>
          {errorMessage ? <p className={styles.message} role="alert">{errorMessage}</p> : null}
          {atCap ? <p className={styles.notice}>An event can have at most 10 hosts.</p> : null}
          <HostDetailsForm
            action={createEventHostAction}
            eventId={event.id}
            values={values}
            submitLabel="Add host"
            cancelHref={editHref}
            submitDisabled={atCap}
          />
        </section>
      </main>
    </>
  );
}

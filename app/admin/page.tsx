import { EventArtwork } from "@/components/event-summary";
import { StatusBadge } from "@/components/ui/badge";
import { LocalizedSchedule } from "@/components/localized-time";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/lib/auth";
import { listAdminEvents } from "@/services/admin-event-service";
import { eventStatusLabel, readPage } from "@app/admin/admin-utils";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Event operations" };

type AdminPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;
  const result = await listAdminEvents(readPage(params.page));

  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <div className={styles.headingRow}>
          <div className={styles.headingCopy}>
            <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
            <h1>Events and participants</h1>
            <p>Manage event details, review registrations, and record attendance.</p>
          </div>
          <Link className={styles.button} href="/admin/events/new">
            Create event
          </Link>
        </div>

        <p className={styles.summary}>
          {result.total} {result.total === 1 ? "event" : "events"} · page {result.page} of {result.pageCount}
        </p>

        {result.events.length > 0 ? (
          <ul className={styles.eventList} aria-label="Events">
            {result.events.map((event) => (
              <li className={`${styles.eventCard} ${styles.eventListCard}`} key={event.id}>
                <Link className={styles.eventThumbnail} href={`/admin/events/${event.id}`} aria-label={`Manage ${event.title}`}>
                  <EventArtwork size="row" slug={event.slug} title={event.title} coverKey={event.coverKey} startsAt={event.startsAt} />
                </Link>
                <div className={styles.eventCardBody}>
                <div className={styles.eventHeading}>
                  <h2>
                    <Link href={`/admin/events/${event.id}`}>{event.title}</Link>
                  </h2>
                  <StatusBadge status={event.status}>{eventStatusLabel(event.status)}</StatusBadge>
                </div>
                <p className={styles.eventMeta}>
                  <LocalizedSchedule start={event.startsAt.toISOString()} end={event.endsAt.toISOString()} compact />
                  <span>{event.location || "Location to be announced"}</span>
                </p>
                <p className={styles.eventCount}>
                  <strong>{event.registrationCount} / {event.capacity}</strong> seats reserved
                </p>
                <Link className={styles.manageLink} href={`/admin/events/${event.id}`}>
                  Manage
                  <span className={styles.visuallyHidden}> {event.title}</span>
                </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <strong>No events yet</strong>
            Create the first event to start building the program.
          </div>
        )}

        {result.pageCount > 1 && (
          <nav className={styles.pager} aria-label="Event pages">
            {result.page > 1 ? (
              <Link href={`/admin?page=${result.page - 1}`}>Previous</Link>
            ) : (
              <span className={styles.pagerSpacer} />
            )}
            <span>Page {result.page} of {result.pageCount}</span>
            {result.page < result.pageCount ? (
              <Link href={`/admin?page=${result.page + 1}`}>Next</Link>
            ) : (
              <span className={styles.pagerSpacer} />
            )}
          </nav>
        )}
      </main>
    </>
  );
}

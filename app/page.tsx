import { ViewerTimeZoneNote } from "@/components/localized-time";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { EventArtwork, EventFacts, placeLine } from "@/components/event-summary";
import { getAvailability } from "@/lib/event-presentation";
import { getUser } from "@/lib/auth";
import { listUpcomingEventRows } from "@/services/event-content-service";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Upcoming events",
  description: "Browse upcoming workshops, training, and learning events.",
};

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

function getPageNumber(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;

  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

async function loadUpcoming(pageNumber: number, now: Date) {
  try {
    return await listUpcomingEventRows(pageNumber, now);
  } catch {
    console.error("Could not load upcoming events.");
    return null;
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const [{ page: pageValue }, user] = await Promise.all([
    searchParams,
    getUser(),
  ]);
  const requestedPage = getPageNumber(pageValue);
  const now = new Date();
  const listing = await loadUpcoming(requestedPage, now);

  if (!listing) {
    return (
      <>
        <SiteHeader user={user} current="events" />
        <main id="main-content" tabIndex={-1} className={styles.page} data-attendee-glass>
          <section className="empty-state" aria-labelledby="events-error-title">
            <h1 id="events-error-title">Upcoming events could not be loaded</h1>
            <p>
              Refresh the page. If this keeps happening, check back in a little
              while.
            </p>
            <Link className="button" href="/">
              Try again
            </Link>
          </section>
        </main>
      </>
    );
  }

  if (listing.total > 0 && requestedPage > listing.pageCount) redirect("/");

  return (
    <>
      <SiteHeader user={user} current="events" />
      <main id="main-content" tabIndex={-1} className={styles.page} data-attendee-glass>
        <section className={styles.intro} aria-labelledby="events-title">
          <div>
            <p className="eyebrow">Learn together</p>
            <h1 id="events-title">Upcoming events</h1>
            <p className="page-lede">
              Find a workshop or training session to learn something new.
            </p>
          </div>
        </section>

        {listing.events.length ? (
          <>
            <p className={styles.count}>
              {listing.total} upcoming {listing.total === 1 ? "event" : "events"} · <ViewerTimeZoneNote />
            </p>
            <ul className={styles.list} aria-label="Upcoming events">
              {listing.events.map((event) => {
                const availability = getAvailability(
                  event.capacity,
                  event.activeRegistrationCount,
                  event.startsAt,
                  now,
                );

                return (
                  <li className={styles.item} key={event.id}>
                    <Link className={styles.row} href={`/events/${event.slug}`} aria-labelledby={`event-${event.id}-title`}>
                    <EventArtwork
                      size="row"
                      slug={event.slug}
                      title={event.title}
                      coverKey={event.coverKey}
                      startsAt={event.startsAt}
                    />
                    <div className={styles.copy}>
                      <h2 className={styles.title} id={`event-${event.id}-title`}>{event.title}</h2>
                      <EventFacts
                        hostName={event.hostName}
                        startsAt={event.startsAt}
                        endsAt={event.endsAt}
                        place={placeLine(event.venueName, event.location)}
                      />
                    </div>
                    <p className={`availability availability-neutral ${styles.availability}`}>
                      {availability.label}
                    </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {listing.pageCount > 1 ? (
              <nav className="pagination" aria-label="Event pages">
                {listing.page > 1 ? (
                  <Link className="button button-secondary" href={`/?page=${listing.page - 1}`}>
                    Previous
                  </Link>
                ) : (
                  <span className="pagination-spacer" aria-hidden="true" />
                )}
                <p>
                  <span aria-current="page">Page {listing.page} of {listing.pageCount}</span>
                </p>
                {listing.page < listing.pageCount ? (
                  <Link className="button button-secondary" href={`/?page=${listing.page + 1}`}>
                    Next
                  </Link>
                ) : (
                  <span className="pagination-spacer" aria-hidden="true" />
                )}
              </nav>
            ) : null}
          </>
        ) : (
          <section className="empty-state" aria-labelledby="empty-events-title">
            <h2 id="empty-events-title">No upcoming events yet</h2>
            <p>
              Check back soon. Published workshops and training sessions will
              appear here.
            </p>
            {user ? (
              <Link
                className="button button-secondary"
                href={user.role === "ADMIN" ? "/admin" : "/my"}
              >
                {user.role === "ADMIN" ? "Go to admin" : "View my events"}
              </Link>
            ) : (
              <Link className="button button-secondary" href="/signup">
                Create an account
              </Link>
            )}
          </section>
        )}
      </main>
    </>
  );
}

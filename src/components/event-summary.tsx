import { LocalizedDateTile, LocalizedSchedule } from "./localized-time";
import styles from "./event-summary.module.css";

export function eventCoverSrc(slug: string): string {
  return `/events/${encodeURIComponent(slug)}/cover`;
}

export function hostAvatarSrc(slug: string, hostId: string): string {
  return `/events/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}/avatar`;
}

export function placeLine(
  venueName: string | null,
  location: string | null,
): string | null {
  const venue = venueName?.trim() ?? "";
  if (venue.length > 0) return venue;
  const where = location?.trim() ?? "";
  return where.length > 0 ? where : null;
}

type ArtworkProps = {
  slug: string;
  title: string;
  coverKey: string | null;
  startsAt: Date;
  size: "row" | "detail";
};

export function EventArtwork({
  slug,
  title,
  coverKey,
  startsAt,
  size,
}: ArtworkProps) {
  const frame = size === "detail" ? styles.detailFrame : styles.rowFrame;
  const key = coverKey?.trim() ?? "";
  if (key.length === 0) {
    return (
      <div className={frame}>
        <LocalizedDateTile value={startsAt.toISOString()} size={size} />
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* Plain img: the public cover route is /events/{slug}/cover. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.image}
        src={eventCoverSrc(slug)}
        alt={title}
        width={size === "detail" ? 280 : 96}
        height={size === "detail" ? 280 : 96}
      />
    </div>
  );
}

type EventFactsProps = {
  hostName: string | null;
  startsAt: Date;
  endsAt: Date;
  place: string | null;
};

export function EventFacts({
  hostName,
  startsAt,
  endsAt,
  place,
}: EventFactsProps) {
  const host = hostName?.trim() ?? "";
  const where = place?.trim() ?? "";

  return (
    <div className={styles.facts}>
      {host.length > 0 ? <p className={styles.host}>Hosted by {host}</p> : null}
      <p className={styles.schedule}>
        <LocalizedSchedule start={startsAt.toISOString()} end={endsAt.toISOString()} />
      </p>
      {where.length > 0 ? <p className={styles.place}>{where}</p> : null}
    </div>
  );
}

import { ValidatedInput } from "@/components/validated-form";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import styles from "../admin.module.css";

type VenueFieldsProps = {
  venueName: string;
  venueAddress: string;
  mapUrl: string;
};

export function VenueFields({ venueName, venueAddress, mapUrl }: VenueFieldsProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="venueName">Venue name</label>
        <ValidatedInput
          id="venueName"
          name="venueName"
          maxLength={EVENT_CONTENT_LIMITS.venueName}
          defaultValue={venueName}
          aria-describedby="venue-name-help"
        />
        <p className={styles.fieldHint} id="venue-name-help">
          Optional. Participants see this name instead of location when it is set. Leave blank to clear.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor="venueAddress">Venue address</label>
        <ValidatedInput
          id="venueAddress"
          name="venueAddress"
          maxLength={EVENT_CONTENT_LIMITS.venueAddress}
          defaultValue={venueAddress}
          aria-describedby="venue-address-help"
        />
        <p className={styles.fieldHint} id="venue-address-help">
          Optional detail. Leave blank to clear.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor="mapUrl">Map URL (HTTPS only)</label>
        <ValidatedInput
          id="mapUrl"
          name="mapUrl"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={EVENT_CONTENT_LIMITS.mapUrl}
          defaultValue={mapUrl}
          aria-describedby="map-url-help"
        />
        <p className={styles.fieldHint} id="map-url-help">
          Optional. Only HTTPS links are saved. Leave blank to clear.
        </p>
      </div>
    </>
  );
}

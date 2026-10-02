import { ValidatedForm, ValidatedInput, ValidatedTextarea, SubmitButton } from "@/components/validated-form";
import Link from "next/link";
import type { EnteredHostFields } from "@app/admin/admin-utils";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import styles from "../../../admin.module.css";

type HostDetailsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  eventId: string;
  hostId?: string;
  values: EnteredHostFields;
  submitLabel: string;
  cancelHref: string;
  submitDisabled?: boolean;
};

export function HostDetailsForm({
  action,
  eventId,
  hostId,
  values,
  submitLabel,
  cancelHref,
  submitDisabled = false,
}: HostDetailsFormProps) {
  return (
    <ValidatedForm schema="host" defaults={values} className={styles.formStack} action={action} autoComplete="off">
      <input type="hidden" name="eventId" value={eventId} />
      {hostId ? <input type="hidden" name="hostId" value={hostId} /> : null}
      <div className={styles.field}>
        <label htmlFor="host-name">Name (required)</label>
        <ValidatedInput
          id="host-name"
          name="name"
          required
          minLength={1}
          maxLength={EVENT_CONTENT_LIMITS.hostName}
          defaultValue={values.name}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-biography">Biography</label>
        <ValidatedTextarea
          id="host-biography"
          name="biography"
          maxLength={EVENT_CONTENT_LIMITS.biography}
          defaultValue={values.biography}
          aria-describedby="host-biography-help"
        />
        <p className={styles.fieldHint} id="host-biography-help">
          Optional. Leave blank to clear.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor="host-public-email">Public email (publicly visible)</label>
        <ValidatedInput
          id="host-public-email"
          name="publicEmail"
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={EVENT_CONTENT_LIMITS.publicEmail}
          defaultValue={values.publicEmail}
          aria-describedby="host-public-email-help"
        />
        <p className={styles.fieldHint} id="host-public-email-help">
          Anyone who can view this event can see this address. Leave blank to clear it.
        </p>
      </div>
      <div className={styles.formActions}>
        <SubmitButton className={styles.button} pendingLabel="Saving host…" disabled={submitDisabled}>
          {submitLabel}
        </SubmitButton>
        <Link className={styles.secondaryButton} href={cancelHref}>
          Cancel
        </Link>
      </div>
    </ValidatedForm>
  );
}

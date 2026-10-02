import { ValidatedForm, ValidatedInput, SubmitButton } from "@/components/validated-form";
import styles from "../admin.module.css";

type StoredImageFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  eventId: string;
  hostId?: string;
  expectedKey: string | null;
  inputId: string;
  label: string;
  submitLabel: string;
};

export function StoredImageForm({
  action,
  eventId,
  hostId,
  expectedKey,
  inputId,
  label,
  submitLabel,
}: StoredImageFormProps) {
  const helpId = `${inputId}-help`;

  return (
    <ValidatedForm schema="image" defaults={{}} className={styles.formStack} action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      {hostId ? <input type="hidden" name="hostId" value={hostId} /> : null}
      <input type="hidden" name="expectedKey" value={expectedKey ?? ""} />
      <div className={styles.field}>
        <label htmlFor={inputId}>{label}</label>
        <ValidatedInput
          id={inputId}
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          aria-describedby={helpId}
        />
        <p className={styles.fieldHint} id={helpId}>
          JPEG, PNG, or WebP up to 2 MiB.
        </p>
      </div>
      <div className={styles.formActions}>
        <SubmitButton className={styles.button} pendingLabel="Uploading image…">
          {submitLabel}
        </SubmitButton>
      </div>
    </ValidatedForm>
  );
}

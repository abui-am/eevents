import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { AuthenticatedUser } from "@/lib/auth";
import styles from "../admin.module.css";

type HiddenField = {
  name: string;
  value: string;
};

type RemoveImageConfirmationProps = {
  user: AuthenticatedUser;
  backHref: string;
  backLabel: string;
  title: string;
  message: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: readonly HiddenField[];
  cancelHref: string;
  cancelLabel: string;
  submitLabel: string;
};

export function RemoveImageConfirmation({
  user,
  backHref,
  backLabel,
  title,
  message,
  action,
  fields,
  cancelHref,
  cancelLabel,
  submitLabel,
}: RemoveImageConfirmationProps) {
  return (
    <>
      <SiteHeader user={user} current="admin" />
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <Link className={styles.backLink} href={backHref}>
          {backLabel}
        </Link>
        <section className={styles.formPanel} aria-labelledby="remove-image-title">
          <p className={`eyebrow ${styles.eyebrow}`}>Administrator workspace</p>
          <h1 id="remove-image-title">{title}</h1>
          <p className={styles.notice}>{message}</p>
          <form className={styles.formStack} action={action}>
            {fields.map((field) => (
              <input key={field.name} type="hidden" name={field.name} value={field.value} />
            ))}
            <input type="hidden" name="confirm" value="delete" />
            <div className={styles.formActions}>
              <button className={styles.dangerButton} type="submit">
                {submitLabel}
              </button>
              <Link className={styles.secondaryButton} href={cancelHref}>
                {cancelLabel}
              </Link>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}

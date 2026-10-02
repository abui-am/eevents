import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AnswerReview } from "@/components/answer-review";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { readQuestions } from "@/lib/questionnaire";
import { getAnswerReview } from "@/services/questionnaire-service";
import { setAdminRegistrationStatusAction } from "@app/actions/admin-events";
import styles from "@/components/questionnaire.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application answers" };
export default async function AdminAnswersPage({ params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const user = await requireAdmin();
  const { id, registrationId } = await params;
  const registration = await getAnswerReview(registrationId, user, id);
  if (!registration) notFound();
  const canReview = registration.status === "REGISTERED" && registration.event.status === "PUBLISHED" && registration.event.startsAt > new Date();
  return <><SiteHeader user={user} current="admin" /><main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.narrow}`}>
    <Link className={styles.back} href={`/admin/events/${id}`}>← Event participants</Link>
    <header className={styles.heading}><div><p className={styles.meta}>{registration.event.title}</p><h1>{registration.participant.name}</h1><p>{registration.participant.email}</p><StatusBadge status={registration.status}>{registration.status === "REGISTERED" ? "Awaiting confirmation" : registration.status.toLowerCase().replace("_", " ")}</StatusBadge></div></header>
    <AnswerReview questions={readQuestions(registration.questionnaireVersion?.questions ?? [])} answers={registration.answers} versionNumber={registration.questionnaireVersion?.number ?? null} />
    {canReview && <div className={styles.actions}>{[{ status: "CONFIRMED", label: "Confirm application" }, { status: "CANCELLED", label: "Decline application" }].map((action) => <form key={action.status} action={setAdminRegistrationStatusAction}>
      <input type="hidden" name="eventId" value={id} /><input type="hidden" name="registrationId" value={registrationId} /><input type="hidden" name="nextStatus" value={action.status} />
      <Button variant={action.status === "CONFIRMED" ? "primary" : "danger"} type="submit">{action.label}</Button>
    </form>)}</div>}
  </main></>;
}

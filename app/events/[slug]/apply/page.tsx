import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ApplicationQuestionnaire } from "@/components/application-questionnaire";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { prefillAnswers, readQuestions } from "@/lib/questionnaire";
import { submitQuestionnaireAction } from "@app/actions/questionnaires";
import styles from "@/components/questionnaire.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply to attend" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/apply`);
  const event = await db.event.findUnique({ where: { slug }, include: { currentQuestionnaireVersion: true, _count: { select: { registrations: { where: { status: { not: "CANCELLED" } } } } } } });
  if (!event || event.status === "DRAFT") notFound();
  const registration = await db.registration.findUnique({ where: { userId_eventId: { userId: user.id, eventId: event.id } }, include: { answers: true } });
  const questions = readQuestions(event.currentQuestionnaireVersion?.questions ?? []);
  const closed = event.status !== "PUBLISHED" || event.startsAt <= new Date();
  const full = event._count.registrations >= event.capacity;
  const active = registration && registration.status !== "CANCELLED";
  const declined = registration?.cancelledBy === "ADMIN";
  const message = active ? "You already have an application for this event." : declined ? "An administrator declined your application. Only an administrator can reopen it." : closed ? "Registration is closed for this event." : full ? "All places are currently reserved." : null;
  return <><SiteHeader user={user} /><main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.narrow}`}>
    <Link className={styles.back} href={`/events/${slug}`}>← Event details</Link>
    <header className={styles.heading}><div><p className={styles.meta}>{event.title}</p><h1>Apply to attend</h1><p>Your answers are private to you and the event administrators. Submitted answers are read-only.</p></div></header>
    {message ? <p className={styles.notice}>{message}</p> : <ApplicationQuestionnaire questions={questions} versionId={event.currentQuestionnaireVersionId} defaults={prefillAnswers(questions, registration?.answers ?? [])} action={submitQuestionnaireAction.bind(null, slug)} />}
  </main></>;
}

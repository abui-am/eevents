import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AnswerReview } from "@/components/answer-review";
import { requireUser } from "@/lib/auth";
import { readQuestions } from "@/lib/questionnaire";
import { getAnswerReview } from "@/services/questionnaire-service";
import styles from "@/components/questionnaire.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "My application answers" };
export default async function MyAnswersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const registration = await getAnswerReview(id, user);
  if (!registration) notFound();
  return <><SiteHeader user={user} current="my" /><main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.narrow}`}>
    <Link className={styles.back} href="/my">← My events</Link>
    <header className={styles.heading}><div><p className={styles.meta}>{registration.event.title}</p><h1>Your application answers</h1><p>Only you and event administrators can view these answers.</p></div></header>
    <AnswerReview questions={readQuestions(registration.questionnaireVersion?.questions ?? [])} answers={registration.answers} versionNumber={registration.questionnaireVersion?.number ?? null} />
  </main></>;
}

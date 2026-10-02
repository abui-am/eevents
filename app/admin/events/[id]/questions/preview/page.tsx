import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { QuestionnairePreview } from "@/components/questionnaire-preview";
import { requireAdmin } from "@/lib/auth";
import { getQuestionnaireEditor } from "@/services/questionnaire-service";
import styles from "@/components/questionnaire.module.css";

export const dynamic = "force-dynamic";
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const result = await getQuestionnaireEditor(id);
  if (!result) notFound();
  return <><SiteHeader user={user} current="admin" /><main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.narrow}`}>
    <Link className={styles.back} href={`/admin/events/${id}/questions`}>← Edit questions</Link>
    <header className={styles.heading}><div><p className={styles.meta}>{result.event.title}</p><h1>Preview registration questions</h1><p>This is the saved draft. Trying the fields does not submit an application.</p></div></header>
    {result.questions.length ? <QuestionnairePreview questions={result.questions} /> : <p className={styles.notice}>No additional questions are required.</p>}
  </main></>;
}

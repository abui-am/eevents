import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { requireAdmin } from "@/lib/auth";
import { getQuestionnaireEditor } from "@/services/questionnaire-service";
import { saveQuestionnaireAction } from "@app/actions/questionnaires";
import styles from "@/components/questionnaire.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registration questions" };

export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const result = await getQuestionnaireEditor(id);
  if (!result) notFound();
  return <><SiteHeader user={user} current="admin" /><main id="main-content" tabIndex={-1} className={`${styles.shell} ${styles.editorShell}`}>
    <Link className={styles.back} href={`/admin/events/${id}`}>← Event operations</Link>
    <header className={styles.heading}><div><p className={styles.meta}>{result.event.title}</p><h1>Registration questions</h1><p>Collect what you need to review applications. Participants answer before reserving a place.</p></div></header>
    {result.unpublished && <p className={styles.notice}>Unpublished changes. Participants still see the current published questionnaire.</p>}
    <QuestionnaireEditor initial={{ revision: result.revision, questions: result.questions, unpublished: result.unpublished }} action={saveQuestionnaireAction.bind(null, id)} previewHref={`/admin/events/${id}/questions/preview`} publishedNumber={result.event.currentQuestionnaireVersion?.number ?? null} locked={result.locked} />
  </main></>;
}

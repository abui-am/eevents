import { answerLabel, type Question, type StoredAnswer } from "@/lib/questionnaire";
import styles from "./questionnaire.module.css";

export function AnswerReview({ questions, answers, versionNumber }: { questions: Question[]; answers: StoredAnswer[]; versionNumber: number | null }) {
  if (versionNumber === null) return <p className={styles.notice}>No questionnaire submitted.</p>;
  return <section className={styles.panel} aria-labelledby="submitted-answers-title">
    <h2 id="submitted-answers-title">Submitted answers</h2>
    <p className={styles.help}>Questionnaire version {versionNumber}. These are the questions shown at submission. Answers are read-only.</p>
    {questions.length ? <dl className={styles.answers}>{questions.map((question) => <div key={question.id}>
      <dt>{question.label}</dt><dd>{answerLabel(question, answers.find((answer) => answer.questionId === question.id))}</dd>
    </div>)}</dl> : <p>No additional questions were required.</p>}
  </section>;
}

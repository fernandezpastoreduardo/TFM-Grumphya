import styles from "./EvaluationFailureNotice.module.scss";

type EvaluationFailureNoticeProps = {
  message: string;
};

export function EvaluationFailureNotice({
  message,
}: EvaluationFailureNoticeProps) {
  return (
    <section className={styles.notice} role="alert">
      <img
        src="/assets/grumphya/evaluation-error-spilled-coffee.svg"
        alt="Grumphya triste junto a una taza de café derramada"
      />
      <p>{message}</p>
    </section>
  );
}

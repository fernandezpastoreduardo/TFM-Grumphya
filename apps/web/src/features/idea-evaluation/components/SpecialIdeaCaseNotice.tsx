import type { SpecialIdeaCaseResult } from "../evaluation-process";
import styles from "./SpecialIdeaCaseNotice.module.scss";

type SpecialIdeaCaseNoticeProps = {
  result: SpecialIdeaCaseResult;
};

export function SpecialIdeaCaseNotice({ result }: SpecialIdeaCaseNoticeProps) {
  return (
    <section className={styles.notice} aria-labelledby="special-case-title">
      <img
        className={styles.mascot}
        src="/assets/grumphya/special-idea-coffee-slippers.svg"
        alt="Grumphya toma café con zapatillas de andar por casa con corazones"
      />
      <div className={styles.copy}>
        <h2 id="special-case-title">{result.title}</h2>
        <p>{result.message}</p>
        {result.action ? (
          <a className={styles.action} href={result.action.href}>
            {result.action.label}
          </a>
        ) : null}
      </div>
    </section>
  );
}

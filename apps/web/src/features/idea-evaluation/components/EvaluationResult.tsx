import { getPublicExistingProductExample } from "../evaluation-process";
import {
  EVALUATION_STATUS_LABELS,
  EXISTING_PRODUCT_EXAMPLE_LABEL,
  FAILED_CRITERIA_TITLE,
} from "./evaluation-result.constants";
import { formatPublicScore } from "./evaluation-result.formatters";
import type { EvaluationResultProps } from "./evaluation-result.models";
import "../idea-evaluation.scss";

export function EvaluationResult({ result }: EvaluationResultProps) {
  const existingProductExample = getPublicExistingProductExample(
    result.existingProductExample,
    result.status,
  );
  return (
    <article
      className={`evaluation-result-card evaluation-result-card--${result.status.toLowerCase()}`}
      aria-label="Resultado de tu idea"
    >
      <div className="evaluation-result-topline">
        <p className="evaluation-result-status">
          {EVALUATION_STATUS_LABELS[result.status]}
        </p>
        <p className="evaluation-result-score">
          {formatPublicScore(result.score)}
        </p>
      </div>
      <h2>{result.headline}</h2>
      <p className="evaluation-result-message">{result.message}</p>
      {existingProductExample && (
        <p className="evaluation-result-example">
          <span>{EXISTING_PRODUCT_EXAMPLE_LABEL}</span>{" "}
          <strong>{existingProductExample}</strong>
        </p>
      )}
      {result.failedCriteria && result.failedCriteria.length > 0 && (
        <section
          className="evaluation-result-failed-criteria"
          aria-labelledby="evaluation-result-failed-criteria-title"
        >
          <h3 id="evaluation-result-failed-criteria-title">
            {FAILED_CRITERIA_TITLE}
          </h3>
          <ul>
            {result.failedCriteria.map((criterion) => (
              <li key={criterion}>
                <span
                  className="evaluation-result-failed-criterion-icon"
                  aria-hidden="true"
                >
                  ×
                </span>
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

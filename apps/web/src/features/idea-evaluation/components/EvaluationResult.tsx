import {
  getPublicExistingProductExample,
  type EvaluationProcessResult,
} from "../evaluation-process";
import "../idea-evaluation.scss";

type EvaluationResultProps = {
  result: EvaluationProcessResult;
};

const STATUS_LABELS: Record<EvaluationProcessResult["status"], string> = {
  RECHAZADA: "Fuera de juego",
  REQUIERE_REVISION: "Necesita más trabajo",
  SIN_BLOQUEO_EVIDENTE: "Sigue en pie, por ahora",
  IDEA_INSUFICIENTE: "Falta la idea",
};
const SPANISH_SCORE_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NO_SCORE_LABEL = "Sin puntuación";
const EXISTING_PRODUCT_EXAMPLE_LABEL =
  "Ejemplo conocido con funciones similares:";
const FAILED_CRITERIA_TITLE = "Puntos que hacen suspender la idea";

function formatPublicScore(score: number | null): string {
  if (score === null) return NO_SCORE_LABEL;
  return `${SPANISH_SCORE_FORMAT.format(score)}/10`;
}

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
          {STATUS_LABELS[result.status]}
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

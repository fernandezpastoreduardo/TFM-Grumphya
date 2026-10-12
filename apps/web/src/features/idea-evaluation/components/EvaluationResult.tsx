import type { EvaluationProcessResult } from "../evaluation-process";

type EvaluationResultProps = {
  result: EvaluationProcessResult;
};

const STATUS_LABELS: Record<EvaluationProcessResult["status"], string> = {
  RECHAZADA: "Fuera de juego",
  SIN_BLOQUEO_EVIDENTE: "Sigue en pie, por ahora",
  IDEA_INSUFICIENTE: "Falta la idea",
};
const SPANISH_SCORE_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NO_SCORE_LABEL = "Sin puntuación";

function formatPublicScore(score: number | null): string {
  if (score === null) return NO_SCORE_LABEL;
  return `${SPANISH_SCORE_FORMAT.format(score)}/10`;
}

export function EvaluationResult({ result }: EvaluationResultProps) {
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
    </article>
  );
}

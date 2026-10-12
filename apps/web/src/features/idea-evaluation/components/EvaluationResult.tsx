import type { EvaluationProcessResult } from "../evaluation-process";

type EvaluationResultProps = {
  result: EvaluationProcessResult;
};

const STATUS_LABELS: Record<EvaluationProcessResult["status"], string> = {
  RECHAZADA: "Idea rechazada",
  SIN_BLOQUEO_EVIDENTE: "Sin bloqueo evidente",
  IDEA_INSUFICIENTE: "Idea insuficiente",
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
    <article className="evaluation-result-card">
      <h2>{STATUS_LABELS[result.status]}</h2>
      <p className="evaluation-result-score">
        {formatPublicScore(result.score)}
      </p>
      <p className="evaluation-result-message">{result.message}</p>
    </article>
  );
}

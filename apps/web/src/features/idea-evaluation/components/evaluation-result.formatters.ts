import { NO_SCORE_LABEL } from "./evaluation-result.constants";

const SPANISH_SCORE_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPublicScore(score: number | null): string {
  if (score === null) return NO_SCORE_LABEL;
  return SPANISH_SCORE_FORMAT.format(score) + "/10";
}

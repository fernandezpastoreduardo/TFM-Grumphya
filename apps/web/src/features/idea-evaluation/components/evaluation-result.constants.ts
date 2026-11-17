import type { EvaluationProcessResult } from "../evaluation-process";

export const EVALUATION_STATUS_LABELS: Record<
  EvaluationProcessResult["status"],
  string
> = {
  RECHAZADA: "Fuera de juego",
  REQUIERE_REVISION: "Necesita más trabajo",
  SIN_BLOQUEO_EVIDENTE: "Sigue en pie, por ahora",
  IDEA_INSUFICIENTE: "Falta la idea",
};
export const NO_SCORE_LABEL = "Sin puntuación";
export const EXISTING_PRODUCT_EXAMPLE_LABEL =
  "Ejemplo conocido con funciones similares:";
export const FAILED_CRITERIA_TITLE = "Puntos que hacen suspender la idea";

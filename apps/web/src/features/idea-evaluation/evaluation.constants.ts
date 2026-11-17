import type { SpecialIdeaCaseResult } from "./evaluation.models";

export const EVALUATION_ENDPOINT = "/api/evaluation-process";
export const EVALUATION_FAILURE_MESSAGE =
  "La evaluación se ha torcido. Ni Grumphya puede arreglarlo con café. No se te ha descontado este intento. Prueba otra vez en un rato.";
export const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
export const EVALUATION_TIMEOUT_MESSAGE =
  "La evaluación está tardando más de lo previsto. La idea sigue en el formulario; inténtalo de nuevo.";
export const EVALUATION_TIMEOUT_CODE = "EVALUATION_TIMEOUT";
export const EVALUATION_OUTCOME_UNKNOWN_CODE = "EVALUATION_OUTCOME_UNKNOWN";
export const EVALUATION_OUTCOME_UNKNOWN_MESSAGE =
  "No hemos podido confirmar si la evaluación terminó. Espera a comprobar el resultado antes de volver a gastar un intento.";
export const INVALID_EVALUATION_RESPONSE_CODE = "INVALID_EVALUATION_RESPONSE";
export const INVALID_EVALUATION_RETRY_MESSAGE =
  "No se ha podido validar esta evaluación. Puedes volver a intentarlo.";
export const ANONYMOUS_QUOTA_EXHAUSTED_CODE = "ANONYMOUS_QUOTA_EXHAUSTED";
export const PLAN_QUOTA_EXHAUSTED_CODE = "PLAN_QUOTA_EXHAUSTED";
export const ACTIVE_PLAN_REQUIRED_CODE = "ACTIVE_PLAN_REQUIRED";
export const EMAIL_VERIFICATION_REQUIRED_CODE = "EMAIL_VERIFICATION_REQUIRED";
export const QUOTA_EXHAUSTED_MESSAGES = {
  ideas:
    "Has agotado tus tres evaluaciones gratuitas. Consulta los planes para continuar.",
  roasts:
    "Has agotado tus tres envíos gratuitos. Consulta los planes para continuar.",
} as const;
export const PLAN_QUOTA_EXHAUSTED_MESSAGES = {
  ideas: "Has agotado las 11 evaluaciones disponibles hoy en Iluminado.",
  roasts: "Has agotado los 11 envíos disponibles hoy en Faltón.",
} as const;
export const MAX_PUBLIC_SCORE = 10;
export const MAX_PUBLIC_HEADLINE_LENGTH = 120;
export const MAX_PUBLIC_MESSAGE_LENGTH = 900;
export const MAX_PUBLIC_REJECTION_MESSAGE_LENGTH = 1_000;
export const MAX_PUBLIC_SAFE_TITLE_LENGTH = 160;
export const MIN_PUBLIC_SAFE_TITLE_LENGTH = 8;
export const MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 2;
export const MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 80;
export const MAX_PUBLIC_FAILED_CRITERIA = 10;
export const SPECIAL_CASE_IDS = new Set([
  "grumphya_equivalent",
  "insult",
  "too_brief",
  "generic_ai_clone",
]);

export function isSpecialIdeaCaseId(
  value: unknown,
): value is SpecialIdeaCaseResult["caseId"] {
  return typeof value === "string" && SPECIAL_CASE_IDS.has(value);
}
export const PUBLIC_FAILED_CRITERION_COPY = [
  "La idea deja la puerta abierta a tus datos.",
  "Hay una parte de la idea que juega con fuego.",
  "El premio puede acabar empujando a hacer daño.",
  "Las piezas de la idea no encajan.",
  "Todo depende de una promesa difícil de comprobar.",
  "Aquí puede saltar una bronca seria entre personas.",
  "No se ve qué gana alguien al volver a usarla.",
  "Las cuentas no salen ni con calculadora.",
  "El plan solo funciona si todo el mundo sigue el guion.",
  "A la idea le falta un giro propio que la saque del montón.",
] as const;
export const PUBLIC_FAILED_CRITERION_COPY_SET = new Set<string>(
  PUBLIC_FAILED_CRITERION_COPY,
);
export const SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N} .&'’()+_-]*$/u;
export const PUBLIC_URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
export const PUBLIC_PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,}\d)/u;
export const PUBLIC_CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;

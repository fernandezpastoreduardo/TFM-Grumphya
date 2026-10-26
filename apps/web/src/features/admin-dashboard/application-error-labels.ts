const EVALUATION_DIAGNOSTIC_LABELS: Record<string, string> = {
  response_shape: "Formato de respuesta inválido",
  criteria_prefix: "Secuencia de criterios inválida",
  criterion_value: "Valores de criterio inválidos",
  decision_fields: "Campos de decisión inválidos",
  visible_message: "Mensaje visible inválido",
  decision_semantics: "Incoherencia entre decisión y criterios",
  evaluator_not_configured: "Evaluador sin configurar",
  evaluation_timeout: "Tiempo de espera agotado en evaluación",
  unexpected_evaluation_failure: "Fallo inesperado en evaluación",
  openai_transport_failure: "Fallo de conexión con el proveedor",
  openai_http_401: "Credenciales rechazadas por el proveedor",
  openai_http_403: "Acceso denegado por el proveedor",
  openai_http_429: "Límite de solicitudes o cuota del proveedor",
  openai_http_4xx: "Solicitud rechazada por el proveedor",
  openai_http_5xx: "Error interno del proveedor",
  openai_response_invalid: "Respuesta inválida del proveedor",
  openai_output_incomplete_max_tokens:
    "Respuesta truncada por límite de tokens",
  openai_output_incomplete: "Respuesta incompleta del proveedor",
  semantic_safe_title_invalid: "Título seguro inválido",
  semantic_rejected_criteria_incomplete: "Criterios de rechazo incompletos",
  semantic_rejected_without_failed_criterion: "Rechazo sin criterio suspenso",
  semantic_rejection_stop_at_mismatch: "Criterio de corte incoherente",
  semantic_rejection_reason_code_mismatch: "Motivo de rechazo incoherente",
  semantic_rejection_basis_not_literal:
    "Justificación ausente del texto original",
  semantic_non_rejected_has_rejection_fields:
    "Resultado positivo con campos de rechazo",
  semantic_insufficient_has_criteria:
    "Idea insuficiente con criterios puntuados",
  semantic_passing_criteria_incomplete:
    "Criterios de resultado positivo incompletos",
  semantic_passing_failed_criterion:
    "Resultado positivo con un criterio suspenso",
};

export function getApplicationErrorDiagnosticLabel(
  diagnosticCode: string | null,
): string | null {
  if (diagnosticCode === null) return null;
  return Object.hasOwn(EVALUATION_DIAGNOSTIC_LABELS, diagnosticCode)
    ? EVALUATION_DIAGNOSTIC_LABELS[diagnosticCode]
    : diagnosticCode;
}

export function getApplicationErrorLabel(
  code: string,
  diagnosticCode: string | null,
): string {
  const diagnosticLabel = getApplicationErrorDiagnosticLabel(diagnosticCode);
  return diagnosticLabel ? `${code} · ${diagnosticLabel}` : code;
}

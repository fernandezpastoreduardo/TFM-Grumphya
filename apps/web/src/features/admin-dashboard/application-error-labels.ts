const EVALUATION_DIAGNOSTIC_LABELS: Record<string, string> = {
  response_shape: "Formato de respuesta inválido",
  criteria_prefix: "Secuencia de criterios inválida",
  criterion_value: "Valores de criterio inválidos",
  decision_fields: "Campos de decisión inválidos",
  visible_message: "Mensaje visible inválido",
  decision_semantics: "Incoherencia entre decisión y criterios",
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

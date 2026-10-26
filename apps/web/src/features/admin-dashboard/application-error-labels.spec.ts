import { describe, expect, it } from "vitest";
import {
  getApplicationErrorDiagnosticLabel,
  getApplicationErrorLabel,
} from "./application-error-labels";

describe("application error labels", () => {
  it.each([
    ["response_shape", "Formato de respuesta inválido"],
    ["criteria_prefix", "Secuencia de criterios inválida"],
    ["criterion_value", "Valores de criterio inválidos"],
    ["decision_fields", "Campos de decisión inválidos"],
    ["visible_message", "Mensaje visible inválido"],
    ["decision_semantics", "Incoherencia entre decisión y criterios"],
  ])("names %s with a specific Spanish description", (code, label) => {
    expect(getApplicationErrorDiagnosticLabel(code)).toBe(label);
    expect(getApplicationErrorLabel("INVALID_EVALUATION_RESPONSE", code)).toBe(
      `INVALID_EVALUATION_RESPONSE · ${label}`,
    );
  });

  it.each([
    ["evaluator_not_configured", "Evaluador sin configurar"],
    ["evaluation_timeout", "Tiempo de espera agotado en evaluación"],
    ["unexpected_evaluation_failure", "Fallo inesperado en evaluación"],
    ["openai_transport_failure", "Fallo de conexión con el proveedor"],
    ["openai_http_401", "Credenciales rechazadas por el proveedor"],
    ["openai_http_403", "Acceso denegado por el proveedor"],
    ["openai_http_429", "Límite de solicitudes o cuota del proveedor"],
    ["openai_http_4xx", "Solicitud rechazada por el proveedor"],
    ["openai_http_5xx", "Error interno del proveedor"],
    ["openai_response_invalid", "Respuesta inválida del proveedor"],
    [
      "openai_output_incomplete_max_tokens",
      "Respuesta truncada por límite de tokens",
    ],
    ["openai_output_incomplete", "Respuesta incompleta del proveedor"],
    ["semantic_safe_title_invalid", "Título seguro inválido"],
    [
      "semantic_rejected_criteria_incomplete",
      "Criterios de rechazo incompletos",
    ],
    [
      "semantic_rejected_without_failed_criterion",
      "Rechazo sin criterio suspenso",
    ],
    ["semantic_rejection_stop_at_mismatch", "Criterio de corte incoherente"],
    [
      "semantic_rejection_reason_code_mismatch",
      "Motivo de rechazo incoherente",
    ],
    [
      "semantic_rejection_basis_not_literal",
      "Justificación ausente del texto original",
    ],
    [
      "semantic_non_rejected_has_rejection_fields",
      "Resultado positivo con campos de rechazo",
    ],
    [
      "semantic_insufficient_has_criteria",
      "Idea insuficiente con criterios puntuados",
    ],
    [
      "semantic_passing_criteria_incomplete",
      "Criterios de resultado positivo incompletos",
    ],
    [
      "semantic_passing_failed_criterion",
      "Resultado positivo con un criterio suspenso",
    ],
  ] as const)("labels the new diagnostic %s", (code, label) => {
    expect(getApplicationErrorDiagnosticLabel(code)).toBe(label);
    expect(getApplicationErrorLabel("EVALUATOR_UNAVAILABLE", code)).toBe(
      `EVALUATOR_UNAVAILABLE · ${label}`,
    );
  });

  it("keeps safe unknown categories visible without treating object keys as labels", () => {
    expect(getApplicationErrorDiagnosticLabel("new_diagnostic")).toBe(
      "new_diagnostic",
    );
    expect(getApplicationErrorDiagnosticLabel("__proto__")).toBe("__proto__");
  });

  it("does not invent a diagnostic when an event has none", () => {
    expect(getApplicationErrorLabel("HTTP_500", null)).toBe("HTTP_500");
  });
});

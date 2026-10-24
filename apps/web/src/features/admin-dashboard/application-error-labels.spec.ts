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

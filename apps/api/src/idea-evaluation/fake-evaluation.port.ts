import type { EvaluationPort, EvaluationPortInput } from "./evaluation-port";

const FAKE_MESSAGE =
  "La idea concreta ofrece una utilidad reconocible para quien necesita organizar este trabajo. Sin embargo, la descripción no explica cómo se comprueba que el resultado sea correcto ni cómo se distingue de otras opciones. Conviene validar primero esa diferencia y la confianza en el material final.";

function createFakeDecision() {
  return {
    status: "SIN_BLOQUEO_EVIDENTE",
    headline: "La idea pasa este primer repaso, con confeti prudente.",
    evaluated: [
      { id: "C01", state: "PUNTUADO", score: 71 },
      { id: "C02", state: "PUNTUADO", score: 72 },
      { id: "C03", state: "INDETERMINADO", score: null },
      { id: "C04", state: "INDETERMINADO", score: null },
      { id: "C05", state: "NO_APLICA", score: null },
      { id: "C06", state: "INDETERMINADO", score: null },
      { id: "C07", state: "NO_APLICA", score: null },
      { id: "C08", state: "INDETERMINADO", score: null },
      { id: "C09", state: "NO_APLICA", score: null },
      { id: "C10", state: "PUNTUADO", score: 60 },
    ],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
    existingProductExample: null,
    message: FAKE_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
  };
}

export class FakeEvaluationPort implements EvaluationPort {
  readonly calls: EvaluationPortInput[] = [];

  async evaluate(input: EvaluationPortInput): Promise<unknown> {
    this.calls.push(input);
    return createFakeDecision();
  }
}

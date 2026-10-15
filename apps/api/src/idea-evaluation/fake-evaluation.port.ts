import type { EvaluationPort, EvaluationPortInput } from "./evaluation-port";

const FAKE_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";

function createFakeDecision() {
  return {
    status: "SIN_BLOQUEO_EVIDENTE",
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
    ],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
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

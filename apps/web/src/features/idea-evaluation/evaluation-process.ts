export type EvaluationVerdict = "reject" | "review" | "promising";

export type EvaluationProcessResult = {
  score: number;
  verdict: EvaluationVerdict;
  unknownCriteriaCount: number;
  isSimulated: boolean;
  rubricVersion: "v1";
};

const EVALUATION_ENDPOINT = "/api/evaluation-process";
const INVALID_RESULT_MESSAGE =
  "El servicio devolvió un resultado que no se puede verificar.";
const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const ALERT_VERDICT: Record<EvaluationVerdict, string> = {
  reject: "descartar",
  review: "revisar",
  promising: "prometedora",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvaluationResponse(
  input: unknown,
): EvaluationProcessResult | null {
  if (!isRecord(input)) return null;
  const { score, verdict, unknownCriteriaCount, isSimulated, rubricVersion } =
    input;
  if (
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100 ||
    (verdict !== "reject" && verdict !== "review" && verdict !== "promising") ||
    typeof unknownCriteriaCount !== "number" ||
    !Number.isInteger(unknownCriteriaCount) ||
    unknownCriteriaCount < 0 ||
    unknownCriteriaCount > 6 ||
    typeof isSimulated !== "boolean" ||
    rubricVersion !== "v1"
  ) {
    return null;
  }

  return { score, verdict, unknownCriteriaCount, isSimulated, rubricVersion };
}

export async function evaluationProcess(
  ideaText: string,
): Promise<EvaluationProcessResult> {
  let response: Response;
  try {
    response = await fetch(EVALUATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaText }),
    });
  } catch {
    throw new Error(EVALUATION_UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) throw new Error(EVALUATION_UNAVAILABLE_MESSAGE);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(INVALID_RESULT_MESSAGE);
  }

  const result = parseEvaluationResponse(payload);
  if (!result) throw new Error(INVALID_RESULT_MESSAGE);
  return result;
}

export function formatEvaluationAlert(result: EvaluationProcessResult): string {
  const simulationNote = result.isSimulated
    ? ` El evaluador real aún no está conectado; hay ${result.unknownCriteriaCount} criterios desconocidos.`
    : "";
  return `Puntuación${result.isSimulated ? " de demostración" : ""}: ${result.score}/100 — ${ALERT_VERDICT[result.verdict]}.${simulationNote}`;
}

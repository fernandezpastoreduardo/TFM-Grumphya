export type EvaluationStatus =
  "RECHAZADA" | "SIN_BLOQUEO_EVIDENTE" | "IDEA_INSUFICIENTE";

export type EvaluationProcessResult = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
};

const EVALUATION_ENDPOINT = "/api/evaluation-process";
const INVALID_RESULT_MESSAGE =
  "El servicio devolvió un resultado que no se puede verificar.";
const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const MAX_PUBLIC_SCORE = 10;
const MAX_PUBLIC_HEADLINE_LENGTH = 120;
const MAX_PUBLIC_MESSAGE_LENGTH = 280;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEvaluationStatus(value: unknown): value is EvaluationStatus {
  return (
    value === "RECHAZADA" ||
    value === "SIN_BLOQUEO_EVIDENTE" ||
    value === "IDEA_INSUFICIENTE"
  );
}

function isValidPublicScore(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_PUBLIC_SCORE)
  );
}

function parseEvaluationResponse(
  input: unknown,
): EvaluationProcessResult | null {
  if (!isRecord(input)) return null;
  const { status, score, headline, message } = input;
  if (
    !isEvaluationStatus(status) ||
    !isValidPublicScore(score) ||
    typeof headline !== "string" ||
    headline.trim().length === 0 ||
    headline.length > MAX_PUBLIC_HEADLINE_LENGTH ||
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_PUBLIC_MESSAGE_LENGTH ||
    (status === "IDEA_INSUFICIENTE" && score !== null) ||
    (status === "RECHAZADA" && score === null)
  ) {
    return null;
  }

  return { status, score, headline, message };
}

export async function evaluationProcess(request: {
  ideaText: string;
  tone: "soft" | "hard";
}): Promise<EvaluationProcessResult> {
  let response: Response;
  try {
    response = await fetch(EVALUATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
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

export type AiOperationOutcome = "success" | "error";
export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

const SAFE_OPERATIONS = new Set([
  "idea_evaluation",
  "idea_embedding",
  "idea_equivalence",
  "roast_reply",
]);
const SAFE_FAILURE_CODES = new Set([
  "OPENAI_TRANSPORT_FAILURE",
  "OPENAI_HTTP_401",
  "OPENAI_HTTP_403",
  "OPENAI_HTTP_429",
  "OPENAI_HTTP_4XX",
  "OPENAI_HTTP_5XX",
  "OPENAI_RESPONSE_INVALID",
  "OPENAI_OUTPUT_INCOMPLETE_MAX_TOKENS",
  "OPENAI_OUTPUT_INCOMPLETE",
  "OPENAI_ROAST_TIMEOUT",
  "OPENAI_ROAST_TRANSPORT",
  "OPENAI_ROAST_HTTP_429",
  "OPENAI_ROAST_HTTP_5XX",
  "OPENAI_ROAST_HTTP_OTHER",
  "OPENAI_ROAST_INCOMPLETE",
  "OPENAI_ROAST_INVALID_RESPONSE",
]);
const SAFE_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const IPV4_ADDRESS_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function normalizeMetricLabel(
  value: string,
  allowed: ReadonlySet<string>,
): string {
  return allowed.has(value) ? value : "other";
}

function normalizeModelLabel(value: string): string {
  return SAFE_MODEL_PATTERN.test(value) && !IPV4_ADDRESS_PATTERN.test(value)
    ? value
    : "other";
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function readPrice(
  operation: string,
  direction: "INPUT" | "OUTPUT",
): number | undefined {
  const environmentVariable = `AI_${operation.toUpperCase()}_${direction}_USD_PER_MILLION_TOKENS`;
  const rawValue = process.env[environmentVariable];
  if (rawValue === undefined || rawValue.trim() === "") return undefined;
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function readAiTokenUsage(
  value: unknown,
  outputTokensAreZero = false,
): AiTokenUsage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const usage = (value as Record<string, unknown>).usage;
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) {
    return {};
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = record.input_tokens ?? record.prompt_tokens;
  const outputTokens = record.output_tokens;
  const validInputTokens = normalizeTokenCount(inputTokens);
  const validOutputTokens = normalizeTokenCount(outputTokens);
  const outputTokenCount = getOutputTokenCount(
    validOutputTokens,
    validInputTokens,
    outputTokensAreZero,
  );
  return {
    ...(validInputTokens !== undefined
      ? { inputTokens: validInputTokens }
      : {}),
    ...(outputTokenCount !== undefined
      ? { outputTokens: outputTokenCount }
      : {}),
  };
}

function getOutputTokenCount(
  outputTokens: number | undefined,
  inputTokens: number | undefined,
  outputTokensAreZero: boolean,
): number | undefined {
  if (outputTokens !== undefined) return outputTokens;
  if (outputTokensAreZero && inputTokens !== undefined) return 0;
  return undefined;
}

export function recordAiOperation(
  operation: string,
  model: string,
  startedAt: number,
  outcome: AiOperationOutcome,
  usage: AiTokenUsage = {},
  failureCode?: string,
): void {
  const safeOperation = normalizeMetricLabel(operation, SAFE_OPERATIONS);
  const safeModel = normalizeModelLabel(model);
  const safeFailureCode =
    failureCode && SAFE_FAILURE_CODES.has(failureCode)
      ? failureCode
      : undefined;
  const inputPrice = readPrice(safeOperation, "INPUT");
  const outputPrice = readPrice(safeOperation, "OUTPUT");
  const estimatedCostUsd =
    usage.inputTokens !== undefined &&
    usage.outputTokens !== undefined &&
    inputPrice !== undefined &&
    outputPrice !== undefined
      ? (usage.inputTokens * inputPrice + usage.outputTokens * outputPrice) /
        1_000_000
      : null;
  const event = {
    type: "ai_operation",
    operation: safeOperation,
    model: safeModel,
    outcome,
    ...(safeFailureCode ? { failureCode: safeFailureCode } : {}),
    // Each line is already one measurement; correlation IDs are unnecessary.
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    estimatedCostUsd,
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

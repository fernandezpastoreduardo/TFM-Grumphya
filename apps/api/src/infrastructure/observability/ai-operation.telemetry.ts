import { randomUUID } from "node:crypto";

export type AiOperationOutcome = "success" | "error";
export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

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
  const inputPrice = readPrice(operation, "INPUT");
  const outputPrice = readPrice(operation, "OUTPUT");
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
    operation,
    traceId: randomUUID(),
    model,
    outcome,
    ...(failureCode ? { failureCode } : {}),
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    estimatedCostUsd,
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

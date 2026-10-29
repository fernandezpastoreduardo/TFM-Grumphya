import { Logger } from "@nestjs/common";

export const AI_USAGE_RECORDER = Symbol("AI_USAGE_RECORDER");
export const TOKENS_PER_MILLION = 1_000_000;

export const AI_OPERATIONS = [
  "idea_evaluation",
  "idea_fingerprint",
  "idea_similarity",
  "idea_embedding",
  "roast",
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

export type AiUsageRecord = {
  userId?: string;
  operation: AiOperation;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
};

export interface AiUsageRecorder {
  record(record: AiUsageRecord): Promise<void>;
}

const usageLogger = new Logger("AiUsageRecorder");

export function recordAiUsageSafely(
  recorder: AiUsageRecorder | undefined,
  record: AiUsageRecord,
): void {
  if (recorder)
    void recorder
      .record(record)
      .catch(() => usageLogger.error("AI_USAGE_RECORDING_FAILED"));
}

type ModelRate = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

// Pricing snapshot consulted 2026-10-29; update alongside model configuration.
const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  "gpt-5.4-mini": {
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 4.5,
  },
  "text-embedding-3-small": {
    inputUsdPerMillion: 0.02,
    cachedInputUsdPerMillion: 0.02,
    outputUsdPerMillion: 0,
  },
};

export function calculateEstimatedCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number | null {
  const rate = MODEL_RATES[model];
  if (
    !rate ||
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isSafeInteger(cachedInputTokens) ||
    cachedInputTokens < 0 ||
    cachedInputTokens > inputTokens ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0
  )
    return null;
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const cost =
    (uncachedInputTokens * rate.inputUsdPerMillion +
      cachedInputTokens * rate.cachedInputUsdPerMillion +
      outputTokens * rate.outputUsdPerMillion) /
    TOKENS_PER_MILLION;
  return Math.round(cost * 1_000_000_000) / 1_000_000_000;
}

export function readTokenUsage(value: unknown): {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
} | null {
  if (!isRecord(value) || !isRecord(value.usage)) return null;
  const inputTokens = value.usage.input_tokens;
  const outputTokens = value.usage.output_tokens;
  const inputDetails = value.usage.input_tokens_details;
  const cachedInputTokens = isRecord(inputDetails)
    ? (inputDetails.cached_tokens ?? 0)
    : 0;
  if (
    !Number.isSafeInteger(inputTokens) ||
    Number(inputTokens) < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    Number(outputTokens) < 0 ||
    !Number.isSafeInteger(cachedInputTokens) ||
    Number(cachedInputTokens) < 0 ||
    Number(cachedInputTokens) > Number(inputTokens)
  ) {
    return null;
  }
  return {
    inputTokens: Number(inputTokens),
    cachedInputTokens: Number(cachedInputTokens),
    outputTokens: Number(outputTokens),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

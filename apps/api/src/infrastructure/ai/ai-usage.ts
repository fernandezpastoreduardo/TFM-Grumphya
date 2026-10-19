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

type ModelRate = { inputUsdPerMillion: number; outputUsdPerMillion: number };

// Pricing snapshot consulted 2026-10-19; update alongside model configuration.
const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  "gpt-5.4-mini": { inputUsdPerMillion: 0.75, outputUsdPerMillion: 4.5 },
  "text-embedding-3-small": {
    inputUsdPerMillion: 0.02,
    outputUsdPerMillion: 0,
  },
};

export function calculateEstimatedCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const rate = MODEL_RATES[model];
  if (!rate) return null;
  const cost =
    (inputTokens * rate.inputUsdPerMillion +
      outputTokens * rate.outputUsdPerMillion) /
    TOKENS_PER_MILLION;
  return Math.round(cost * 1_000_000_000) / 1_000_000_000;
}

export function readTokenUsage(
  value: unknown,
): { inputTokens: number; outputTokens: number } | null {
  if (!isRecord(value) || !isRecord(value.usage)) return null;
  const inputTokens = value.usage.input_tokens;
  const outputTokens = value.usage.output_tokens;
  if (
    !Number.isSafeInteger(inputTokens) ||
    Number(inputTokens) < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    Number(outputTokens) < 0
  ) {
    return null;
  }
  return {
    inputTokens: Number(inputTokens),
    outputTokens: Number(outputTokens),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
